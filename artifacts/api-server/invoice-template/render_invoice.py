import os
import json
import base64
import subprocess
from decimal import Decimal, ROUND_HALF_UP
import jinja2

# --- Amount to Indian Words ---
ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
        "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
        "Seventeen", "Eighteen", "Nineteen"]
TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]

def two_digits_to_words(n):
    if n < 20:
        return ONES[n]
    tens = TENS[n // 10]
    ones = ONES[n % 10]
    return f"{tens} {ones}".strip()

def three_digits_to_words(n):
    hundreds = n // 100
    remainder = n % 100
    parts = []
    if hundreds > 0:
        parts.append(f"{ONES[hundreds]} Hundred")
    if remainder > 0:
        parts.append(two_digits_to_words(remainder))
    return " ".join(parts)

def amount_to_indian_words(amount):
    dec = Decimal(str(amount)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    rupees = int(dec)
    paise = int((dec - rupees) * 100)

    if rupees == 0:
        words = "Zero"
    else:
        parts = []
        crores = rupees // 10000000
        rupees %= 10000000
        lakhs = rupees // 100000
        rupees %= 100000
        thousands = rupees // 1000
        rupees %= 1000
        hundreds = rupees

        if crores > 0:
            parts.append(f"{two_digits_to_words(crores)} Crore")
        if lakhs > 0:
            parts.append(f"{two_digits_to_words(lakhs)} Lakh")
        if thousands > 0:
            parts.append(f"{two_digits_to_words(thousands)} Thousand")
        if hundreds > 0:
            parts.append(three_digits_to_words(hundreds))
        words = " ".join(parts)

    words = f"{words} Rupees"
    if paise > 0:
        words += f" and {two_digits_to_words(paise)} Paise"
    words += " Only"
    return words.strip()

def round_money(val):
    return Decimal(str(val)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

def format_num(val):
    d = round_money(val)
    s = f"{d:.2f}"
    parts = s.split(".")
    int_part = parts[0]
    frac_part = parts[1]
    # Indian comma grouping: last 3 digits, then groups of 2
    if len(int_part) > 3:
        last3 = int_part[-3:]
        rest = int_part[:-3]
        groups = []
        while len(rest) > 2:
            groups.insert(0, rest[-2:])
            rest = rest[:-2]
        if rest:
            groups.insert(0, rest)
        int_formatted = ",".join(groups) + "," + last3
    else:
        int_formatted = int_part
    return f"{int_formatted}.{frac_part}"

def format_money(val):
    return f"₹ {format_num(val)}"

def calculate_invoice(data):
    seller_state_code = str(data.get("seller", {}).get("state_code", "27")).strip()
    shipping_iso = data.get("shipping", {}).get("iso", "IN-MH")
    shipping_state_code = shipping_iso.replace("IN-", "").strip()
    if shipping_state_code in ["MH", "27"]:
        shipping_state_code = "27"
    
    intra_state = (seller_state_code == shipping_state_code) or (seller_state_code == "27" and "maharashtra" in str(data.get("shipping", {}).get("state", "")).lower())

    # Calculate Items
    items_total = Decimal("0.00")
    items_taxable = Decimal("0.00")
    items_cgst = Decimal("0.00")
    items_sgst = Decimal("0.00")
    items_igst = Decimal("0.00")
    items_gross = Decimal("0.00")
    items_discount = Decimal("0.00")
    total_qty = 0

    computed_items = []
    for it in data.get("items", []):
        qty = int(it.get("qty", 1))
        total_qty += qty
        mrp = round_money(it.get("mrp", it.get("unit_price", 0)))
        unit_price = round_money(it.get("unit_price", 0))
        gst_rate = Decimal(str(it.get("gst_rate", 5.0)))
        
        selling_total = round_money(unit_price * qty)
        gross = round_money(mrp * qty)
        discount = round_money(max(Decimal("0.00"), gross - selling_total))
        
        # Inclusive calculation
        rate_factor = Decimal("1.00") + (gst_rate / Decimal("100"))
        taxable = round_money(selling_total / rate_factor)
        gst = round_money(selling_total - taxable)
        
        if intra_state:
            cgst = round_money(gst / Decimal("2"))
            sgst = round_money(gst - cgst)
            igst = Decimal("0.00")
        else:
            cgst = Decimal("0.00")
            sgst = Decimal("0.00")
            igst = gst

        items_total += selling_total
        items_taxable += taxable
        items_cgst += cgst
        items_sgst += sgst
        items_igst += igst
        items_gross += gross
        items_discount += discount

        computed_items.append({
            **it,
            "qty": qty,
            "mrp": float(mrp),
            "unit_price": float(unit_price),
            "gst_rate": float(gst_rate),
            "gross": float(gross),
            "discount": float(discount),
            "taxable": float(taxable),
            "cgst": float(cgst),
            "sgst": float(sgst),
            "igst": float(igst),
            "total": float(selling_total),
        })

    # Calculate Charges
    charges_total = Decimal("0.00")
    charges_taxable = Decimal("0.00")
    charges_cgst = Decimal("0.00")
    charges_sgst = Decimal("0.00")
    charges_igst = Decimal("0.00")

    computed_charges = []
    for f in data.get("charges", []):
        amt = round_money(f.get("amount", 0))
        gst_rate = Decimal(str(f.get("gst_rate", 0.0)))
        
        rate_factor = Decimal("1.00") + (gst_rate / Decimal("100"))
        taxable = round_money(amt / rate_factor) if gst_rate > 0 else amt
        gst = round_money(amt - taxable) if gst_rate > 0 else Decimal("0.00")
        
        if intra_state:
            cgst = round_money(gst / Decimal("2"))
            sgst = round_money(gst - cgst)
            igst = Decimal("0.00")
        else:
            cgst = Decimal("0.00")
            sgst = Decimal("0.00")
            igst = gst

        charges_total += amt
        charges_taxable += taxable
        charges_cgst += cgst
        charges_sgst += sgst
        charges_igst += igst

        computed_charges.append({
            **f,
            "amount": float(amt),
            "taxable": float(taxable),
            "cgst": float(cgst),
            "sgst": float(sgst),
            "igst": float(igst),
            "gst_rate": float(gst_rate),
        })

    grand_total = items_total + charges_total

    totals = {
        "qty": total_qty,
        "gross": float(items_gross),
        "discount": float(items_discount),
        "taxable": float(items_taxable),
        "cgst": float(items_cgst),
        "sgst": float(items_sgst),
        "igst": float(items_igst),
        "items_subtotal": float(items_total),
        "items_words": amount_to_indian_words(items_total),
        "charges": float(charges_total),
        "charges_taxable": float(charges_taxable),
        "charges_cgst": float(charges_cgst),
        "charges_sgst": float(charges_sgst),
        "charges_igst": float(charges_igst),
        "grand": float(grand_total),
        "words": amount_to_indian_words(grand_total),
    }

    return {
        "items": computed_items,
        "charges": computed_charges,
        "totals": totals,
        "tax": {
            "intra_state": intra_state,
        }
    }

def render_html(data, template_path="invoice_template.html", logo_path="logo.png"):
    dir_path = os.path.dirname(os.path.abspath(__file__))
    if not os.path.isabs(template_path):
        template_path = os.path.join(dir_path, template_path)
    if not os.path.isabs(logo_path):
        logo_path = os.path.join(dir_path, logo_path)

    # Encode logo
    if os.path.exists(logo_path):
        with open(logo_path, "rb") as f:
            logo_b64 = "data:image/png;base64," + base64.b64encode(f.read()).decode("utf-8")
        data["company"]["logo"] = logo_b64

    # Calculate
    calc = calculate_invoice(data)
    data["items"] = calc["items"]
    data["charges"] = calc["charges"]
    data["totals"] = calc["totals"]
    data["tax"] = calc["tax"]

    # Generate QR Code
    qr_str = f"{data['invoice']['number']}|{data['order']['id']}|{calc['totals']['grand']:.2f}|{data['invoice']['date']}"
    try:
        import qrcode
        from io import BytesIO
        qr = qrcode.QRCode(box_size=4, border=1)
        qr.add_data(qr_str)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        buf = BytesIO()
        img.save(buf, format="PNG")
        qr_b64 = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("utf-8")
    except Exception:
        # Fallback tiny 1x1 png or empty
        qr_b64 = ""
    data["qr"] = qr_b64

    with open(template_path, "r", encoding="utf-8") as f:
        tpl_str = f.read()

    env = jinja2.Environment()
    env.globals.update({
        "money": format_money,
        "num": format_num,
    })
    template = env.from_string(tpl_str)
    return template.render(**data)

def generate_pdf(html_content, output_pdf_path):
    chrome_paths = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        "/usr/bin/google-chrome",
        "/usr/bin/chromium-browser",
    ]
    chrome_bin = next((p for p in chrome_paths if os.path.exists(p)), None)
    if not chrome_bin:
        raise RuntimeError("No Chromium/Chrome/Edge browser found for PDF printing.")

    temp_html = output_pdf_path + ".temp.html"
    with open(temp_html, "w", encoding="utf-8") as f:
        f.write(html_content)

    try:
        subprocess.run([
            chrome_bin,
            "--headless=new",
            "--disable-gpu",
            "--no-pdf-header-footer",
            f"--print-to-pdf={output_pdf_path}",
            f"file:///{os.path.abspath(temp_html).replace(os.sep, '/')}"
        ], check=True)
    finally:
        if os.path.exists(temp_html):
            os.remove(temp_html)

if __name__ == "__main__":
    dir_path = os.path.dirname(os.path.abspath(__file__))
    sample_json_path = os.path.join(dir_path, "sample_order.json")
    with open(sample_json_path, "r", encoding="utf-8") as f:
        sample_order = json.load(f)
    
    html = render_html(sample_order)
    pdf_out = os.path.join(dir_path, "output_V225.pdf")
    generate_pdf(html, pdf_out)
    print("Rendered PDF to", pdf_out)
