import { Module } from "@medusajs/framework/utils";
import ProductQuestionsModuleService from "./service";

export const PRODUCT_QUESTIONS_MODULE = "product_questions";

export default Module(PRODUCT_QUESTIONS_MODULE, {
  service: ProductQuestionsModuleService,
});

export { default as ProductQuestionsModuleService } from "./service";
export { ProductQuestion } from "./models/product-question";
