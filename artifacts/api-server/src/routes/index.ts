import { Router, type IRouter } from "express";
import healthRouter from "./health";
import productsRouter from "./products";
import vendorsRouter from "./vendors";
import wishlistsRouter from "./wishlists";

const router: IRouter = Router();

router.use(healthRouter);
router.use(productsRouter);
router.use(vendorsRouter);
router.use(wishlistsRouter);

export default router;
