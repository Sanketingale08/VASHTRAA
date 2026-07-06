import { Router, type IRouter } from "express";
import healthRouter from "./health";
import productsRouter from "./products";
import vendorsRouter from "./vendors";

const router: IRouter = Router();

router.use(healthRouter);
router.use(productsRouter);
router.use(vendorsRouter);

export default router;
