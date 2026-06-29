import { MedusaService } from "@medusajs/framework/utils";
import { ProductQuestion } from "./models/product-question";

class ProductQuestionsModuleService extends MedusaService({
  ProductQuestion,
}) {}

export default ProductQuestionsModuleService;
