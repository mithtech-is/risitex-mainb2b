import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { PRODUCT_QUESTIONS_MODULE } from "../../../modules/product-questions";
import type ProductQuestionsModuleService from "../../../modules/product-questions/service";

/**
 * GET /admin/product-questions?product_id=&unanswered=true
 *
 * Lists questions for moderation. Optionally filter by product or to only
 * unanswered ones.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const productId = (req.query.product_id ?? "").toString().trim();
  const unanswered = (req.query.unanswered ?? "").toString() === "true";

  const svc = req.scope.resolve<ProductQuestionsModuleService>(
    PRODUCT_QUESTIONS_MODULE,
  );
  const filter: Record<string, unknown> = {};
  if (productId) filter.product_id = productId;
  if (unanswered) filter.answer = null;

  const [questions, count] = await svc.listAndCountProductQuestions(filter, {
    order: { created_at: "DESC" },
    take: 100,
  });
  res.json({ questions, count });
};

/**
 * POST /admin/product-questions
 *
 * Answer (and by default publish) a question.
 * Body: { id, answer, is_public? }
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const body = (req.body ?? {}) as {
    id?: string;
    answer?: string;
    is_public?: boolean;
  };

  const id = (body.id ?? "").trim();
  const answer = (body.answer ?? "").trim();
  if (!id || !answer) {
    return res.status(400).json({ message: "id and answer are required" });
  }

  const svc = req.scope.resolve<ProductQuestionsModuleService>(
    PRODUCT_QUESTIONS_MODULE,
  );
  const updated = await svc.updateProductQuestions({
    id,
    answer,
    is_public: body.is_public ?? true,
    answered_at: new Date(),
  });

  res.json({ question: updated });
};
