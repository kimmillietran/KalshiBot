"use client";

import { Copy, CopyCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { iconSize, textCaption, toneClasses } from "@/lib/design-system";
import type { TradeDecision } from "@/types/domain/trading";
import { cn } from "@/lib/utils";

import {
  DECISION_EXPORT_BUTTON_LABEL,
  DECISION_EXPORT_COPIED_LABEL,
  DECISION_EXPORT_ERROR_LABEL,
} from "../../constants";
import {
  copyTextToClipboard,
  type ClipboardLike,
  type CopyTextResult,
} from "../../utils/copyTextToClipboard";
import { serializeTradeDecision } from "../../utils/serializeTradeDecision";

type DecisionExportButtonProps = {
  decision: TradeDecision;
  copyText?: (text: string, clipboard?: ClipboardLike | null) => Promise<CopyTextResult>;
  clipboard?: ClipboardLike | null;
};

type ExportStatus = "idle" | "copied" | "error";

const RESET_MS = 2_000;

export function DecisionExportButton({
  decision,
  copyText = copyTextToClipboard,
  clipboard,
}: DecisionExportButtonProps) {
  const [status, setStatus] = useState<ExportStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  const scheduleReset = useCallback(() => {
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
    }

    resetTimerRef.current = setTimeout(() => {
      setStatus("idle");
      setErrorMessage(null);
    }, RESET_MS);
  }, []);

  const handleCopy = useCallback(async () => {
    const result = await copyText(serializeTradeDecision(decision), clipboard);

    if (result.ok) {
      setStatus("copied");
      setErrorMessage(null);
      scheduleReset();
      return;
    }

    setStatus("error");
    setErrorMessage(result.error);
    scheduleReset();
  }, [clipboard, copyText, decision, scheduleReset]);

  const label =
    status === "copied"
      ? DECISION_EXPORT_COPIED_LABEL
      : status === "error"
        ? DECISION_EXPORT_ERROR_LABEL
        : DECISION_EXPORT_BUTTON_LABEL;

  const Icon = status === "copied" ? CopyCheck : Copy;

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-live="polite"
        onClick={() => {
          void handleCopy();
        }}
      >
        <Icon className={iconSize.sm} aria-hidden />
        {label}
      </Button>
      {status === "error" && errorMessage ? (
        <p className={cn(textCaption, toneClasses.warning.text, "max-w-48 text-right")}>
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
