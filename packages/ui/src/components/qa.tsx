"use client";

import * as React from "react";
import { ShieldCheck } from "lucide-react";
import { Badge } from "./badge";
import { cn } from "./utils";

export type QAItem = {
  id: string;
  question: string;
  /** Author of the question */
  askedBy: string;
  askedAt: string;
  answers: {
    id: string;
    body: string;
    author: string;
    /** Marks the answer as official RISITEX response */
    isOfficial?: boolean;
    answeredAt: string;
    upvotes?: number;
  }[];
};

export type QABlockProps = {
  items: QAItem[];
  className?: string;
};

export function QABlock({ items, className }: QABlockProps) {
  if (items.length === 0) {
    return (
      <div className={cn("border-t border-border-subtle py-8", className)}>
        <h2 className="text-heading-lg text-text-primary">Questions</h2>
        <p className="mt-3 text-body-md text-text-muted">
          No questions yet. Ask the first one — we usually reply within a day.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("border-t border-border-subtle py-10", className)}>
      <h2 className="text-heading-xl text-text-primary">Questions</h2>
      <ul className="mt-8 space-y-8">
        {items.map((q) => (
          <li
            key={q.id}
            className="border-t border-border-subtle pt-6 first:border-t-0 first:pt-0"
          >
            <div className="flex flex-wrap items-center gap-3 text-caption text-text-muted">
              <span>{q.askedBy}</span>
              <span>·</span>
              <span>{new Date(q.askedAt).toLocaleDateString()}</span>
            </div>
            <p className="mt-2 text-body-lg text-text-primary">
              <span className="font-medium">Q.</span> {q.question}
            </p>
            <div className="mt-4 space-y-4 border-l-2 border-border-subtle pl-4">
              {q.answers.map((a) => (
                <div key={a.id}>
                  <div className="flex flex-wrap items-center gap-2">
                    {a.isOfficial ? (
                      <Badge tone="accent" size="xs">
                        <ShieldCheck className="h-3 w-3" />
                        Answered by RISITEX
                      </Badge>
                    ) : (
                      <span className="text-caption text-text-muted">
                        {a.author}
                      </span>
                    )}
                    <span className="text-caption text-text-muted">
                      · {new Date(a.answeredAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="mt-1 text-body-md text-text-secondary">
                    {a.body}
                  </p>
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
