import { z } from "zod";
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";

export const validateBody = (schema: z.ZodSchema) => {
    return (req: MedusaRequest, res: MedusaResponse, next: () => void) => {
        try {
            req.body = schema.parse(req.body);
            next();
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({
                    message: "Validation failed",
                    errors: error.issues,
                });
            } else {
                res.status(400).json({ message: "Invalid request body" });
            }
        }
    };
};
