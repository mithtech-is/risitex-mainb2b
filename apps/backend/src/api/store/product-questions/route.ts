import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { PRODUCT_QUESTIONS_MODULE } from "../../../modules/product-questions";
import type ProductQuestionsModuleService from "../../../modules/product-questions/service";

/**
 * GET /store/product-questions?product_id=<handle>
 *
 * Returns the public (answered + published) questions for a product, newest
 * first. Used by the PDP "Questions & answers" tab.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const productId = (req.query.product_id ?? "").toString().trim();
  if (!productId) {
    return res.status(400).json({ message: "product_id is required" });
  }

  const svc = req.scope.resolve<ProductQuestionsModuleService>(
    PRODUCT_QUESTIONS_MODULE,
  );
  const questions = await svc.listProductQuestions(
    { product_id: productId, is_public: true },
    { order: { created_at: "DESC" }, take: 20 },
  );
  res.json({ questions });
};

/**
 * POST /store/product-questions
 *
 * Submit a new question. Stored unpublished until an admin answers it.
 * Body: { product_id, customer_name, customer_email, question }
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const body = (req.body ?? {}) as {
    product_id?: string;
    customer_name?: string;
    customer_email?: string;
    question?: string;
  };

  const product_id = (body.product_id ?? "").trim();
  const customer_name = (body.customer_name ?? "").trim();
  const customer_email = (body.customer_email ?? "").trim().toLowerCase();
  const question = (body.question ?? "").trim();

  if (!product_id || !customer_name || !customer_email || !question) {
    return res.status(400).json({
      message:
        "product_id, customer_name, customer_email and question are required",
    });
  }

  const svc = req.scope.resolve<ProductQuestionsModuleService>(
    PRODUCT_QUESTIONS_MODULE,
  );
  const created = await svc.createProductQuestions({
    product_id,
    customer_name,
    customer_email,
    question,
    is_public: false,
  });

  res.status(201).json({ question: created });
};
