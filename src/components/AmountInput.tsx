"use client";

import { useLayoutEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { formatAmountInput } from "@/lib/urlState.ts";

type Props = Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "inputMode"> & { value: string; onValueChange: (v: string) => void };

/** A money box that puts the commas in as you type, and keeps the caret beside the digit you were editing. */
export function AmountInput({ value, onValueChange, ...rest }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  // How many digits sat before the caret when the text changed, so it can be put back after the commas move.
  const digitsBefore = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const n = digitsBefore.current;
    if (!el || n === null || document.activeElement !== el) return;
    digitsBefore.current = null;
    let pos = 0;
    for (let seen = 0; pos < value.length && seen < n; pos++) if (/[\d.]/.test(value[pos])) seen++;
    el.setSelectionRange(pos, pos);
  }, [value]);

  return (
    <Input
      {...rest}
      ref={ref}
      inputMode="decimal"
      value={value}
      onChange={(e) => {
        const el = e.target;
        digitsBefore.current = el.value.slice(0, el.selectionStart ?? el.value.length).replace(/[^\d.]/g, "").length;
        onValueChange(formatAmountInput(el.value));
      }}
    />
  );
}
