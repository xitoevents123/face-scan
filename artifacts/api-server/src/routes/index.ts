import { Router, type IRouter } from "express";
import healthRouter from "./health";
import imagesRouter from "./images";
import searchRouter from "./search";
import statsRouter from "./stats";
import ingestRouter from "./ingest";
import libraryRouter from "./library";
import r2libraryRouter from "./r2library";
import r2indexRouter from "./r2index";

const router: IRouter = Router();

router.use(healthRouter);
router.use(imagesRouter);
router.use(searchRouter);
router.use(statsRouter);
router.use(ingestRouter);
router.use(libraryRouter);
router.use(r2libraryRouter);
router.use(r2indexRouter);

export default router;
