import { Router, type IRouter } from "express";
import healthRouter from "./health";
import productsRouter from "./products";
import vendorsRouter from "./vendors";
import wishlistsRouter from "./wishlists";
import cartRouter from "./cart";
import ordersRouter from "./orders";
import addressesRouter from "./addresses";
import couponsRouter from "./coupons";
import shippingRouter from "./shipping";
import accountRouter from "./account";
import rewardsRouter from "./rewards";
import notificationsRouter from "./notifications";

const router: IRouter = Router();

router.use(healthRouter);
router.use(productsRouter);
router.use(vendorsRouter);
router.use(wishlistsRouter);
router.use(cartRouter);
router.use(ordersRouter);
router.use(addressesRouter);
router.use(couponsRouter);
router.use(shippingRouter);
router.use(accountRouter);
router.use(rewardsRouter);
router.use(notificationsRouter);

export default router;
