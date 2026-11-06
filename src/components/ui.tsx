"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useRef } from "react";
import { cva } from "class-variance-authority";
export const cn = (...v: ClassValue[]) => twMerge(clsx(v));
const buttonVariants = cva("button", {
  variants: {
    variant: { primary: "primary", secondary: "secondary", ghost: "ghost" },
  },
  defaultVariants: { variant: "primary" },
});
export function Button({
  children,
  className,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
}) {
  return (
    <button className={cn(buttonVariants({ variant }), className)} {...props}>
      {children}
    </button>
  );
}
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide = false,
  error,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
  error?: string;
}) {
  const returnFocus = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className={cn("dialog", wide && "wide")}
          onOpenAutoFocus={() => {
            returnFocus.current =
              document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (document.querySelector('[role="dialog"][data-state="open"]'))
              return;
            const target = returnFocus.current;
            if (target?.isConnected) {
              target.focus({ preventScroll: true });
            } else {
              const heading = document.querySelector<HTMLElement>("main h1");
              if (heading) {
                heading.tabIndex = -1;
                heading.focus({ preventScroll: true });
              }
            }
          }}
        >
          <div className="dialog-head">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>
                {description || "Review the details below."}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button className="icon-button" aria-label="Close dialog">
                <X size={20} />
              </button>
            </Dialog.Close>
          </div>
          {error && (
            <div className="error-banner" role="alert">
              {error}
            </div>
          )}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
