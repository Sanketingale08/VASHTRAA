import { isShiprocketConfigured, shiprocketApiRequest } from "./shiprocketClient";
import { shiprocketMock, MockCourierRate } from "./shiprocketMock";

export interface CourierServiceabilityQuery {
  pickupPincode: string;
  deliveryPincode: string;
  weightKg?: number;
  isCod?: boolean;
}

export interface AvailableCourierOption {
  courierCompanyId: number;
  courierName: string;
  freightCharge: number;
  estimatedDeliveryDays: number;
  etd: string;
  rating: number;
  codSupported: boolean;
}

export interface CourierServiceabilityResult {
  available: boolean;
  couriers: AvailableCourierOption[];
  recommendedCourierId?: number;
  message?: string;
  error?: string;
}

/**
 * Checks courier serviceability and rates for a given pickup-delivery PIN pair.
 */
export async function getAvailableCouriers(
  query: CourierServiceabilityQuery
): Promise<CourierServiceabilityResult> {
  const { pickupPincode, deliveryPincode, weightKg = 0.5, isCod = false } = query;

  if (!pickupPincode || !/^\d{6}$/.test(pickupPincode.trim())) {
    return { available: false, couriers: [], error: "Invalid seller pickup PIN code" };
  }
  if (!deliveryPincode || !/^\d{6}$/.test(deliveryPincode.trim())) {
    return { available: false, couriers: [], error: "Invalid customer delivery PIN code" };
  }

  if (isShiprocketConfigured()) {
    const res = await shiprocketApiRequest("/courier/serviceability/", {
      method: "GET",
      params: {
        pickup_postcode: pickupPincode.trim(),
        delivery_postcode: deliveryPincode.trim(),
        weight: weightKg,
        cod: isCod ? 1 : 0,
      },
    });

    if (!res.success || !res.data) {
      return {
        available: false,
        couriers: [],
        error: res.error || "Failed to check courier serviceability with Shiprocket",
      };
    }

    const data = res.data?.data || res.data;
    const rawCouriers: any[] = data?.available_courier_companies || [];

    if (rawCouriers.length === 0) {
      return {
        available: false,
        couriers: [],
        message: "No courier service available between these PIN codes",
      };
    }

    const couriers: AvailableCourierOption[] = rawCouriers.map((c: any) => ({
      courierCompanyId: c.courier_company_id,
      courierName: c.courier_name,
      freightCharge: Math.round(Number(c.rate ?? c.freight_charge ?? 70)),
      estimatedDeliveryDays: parseInt(c.estimated_delivery_days || "4", 10),
      etd: c.etd || `${c.estimated_delivery_days || 4} Days`,
      rating: parseFloat(c.rating || "4.5"),
      codSupported: c.cod === 1 || c.cod === true,
    }));

    return {
      available: true,
      couriers,
      recommendedCourierId: data?.recommended_courier_company_id || couriers[0]?.courierCompanyId,
      message: `${couriers.length} courier partner(s) available for delivery`,
    };
  }

  // High-fidelity sandbox / mock mode
  const mockResult = shiprocketMock.checkServiceability({
    pickup_postcode: pickupPincode.trim(),
    delivery_postcode: deliveryPincode.trim(),
    weight: weightKg,
    cod: isCod ? 1 : 0,
  });

  const rawCouriers = mockResult.data.available_courier_companies;
  if (rawCouriers.length === 0) {
    return {
      available: false,
      couriers: [],
      message: "Delivery not available to this destination PIN code",
    };
  }

  const couriers: AvailableCourierOption[] = rawCouriers.map((c: MockCourierRate) => ({
    courierCompanyId: c.courier_company_id,
    courierName: c.courier_name,
    freightCharge: c.rate,
    estimatedDeliveryDays: c.estimated_delivery_days,
    etd: c.etd,
    rating: c.rating,
    codSupported: c.cod === 1,
  }));

  return {
    available: true,
    couriers,
    recommendedCourierId: mockResult.data.recommended_courier_company_id,
    message: `${couriers.length} courier partner(s) available`,
  };
}
