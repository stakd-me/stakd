"use client";

import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useClickOutside } from "@/hooks/use-click-outside";
import { cn } from "@/lib/utils";

export interface MenuItem {
  key: string;
  label: ReactNode;
  onSelect: () => void;
}

interface MenuButtonProps {
  label: ReactNode;
  items: MenuItem[];
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  disabled?: boolean;
  menuClassName?: string;
  "aria-label"?: string;
}

/**
 * A button that opens a menu, with the keyboard contract a menu promises:
 * focus moves into it on open, arrows/Home/End move between items, Escape
 * and Tab close it and return focus to the button, a click outside closes it.
 */
export function MenuButton({
  label,
  items,
  variant = "outline",
  size = "sm",
  disabled,
  menuClassName,
  "aria-label": ariaLabel,
}: MenuButtonProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();

  useClickOutside(rootRef, useCallback(() => setOpen(false), []));

  useEffect(() => {
    if (open) itemRefs.current[0]?.focus();
  }, [open]);

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  };

  const focusItem = (index: number) => {
    const count = items.length;
    itemRefs.current[(index + count) % count]?.focus();
  };

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = itemRefs.current.findIndex((el) => el === document.activeElement);
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusItem(current + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusItem(current - 1);
        break;
      case "Home":
        event.preventDefault();
        focusItem(0);
        break;
      case "End":
        event.preventDefault();
        focusItem(items.length - 1);
        break;
      case "Escape":
        event.preventDefault();
        close(true);
        break;
      case "Tab":
        close(false);
        break;
    }
  };

  const handleButtonKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" && !open) {
      event.preventDefault();
      setOpen(true);
    }
  };

  return (
    <div className="relative" ref={rootRef}>
      <Button
        ref={buttonRef}
        variant={variant}
        size={size}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={handleButtonKeyDown}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={ariaLabel}
      >
        {label}
      </Button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          onKeyDown={handleMenuKeyDown}
          className={cn(
            "absolute left-0 top-full z-50 mt-1 min-w-44 rounded-overlay border border-border bg-bg-input py-1 shadow-overlay",
            menuClassName
          )}
        >
          {items.map((item, index) => (
            <button
              key={item.key}
              ref={(node) => {
                itemRefs.current[index] = node;
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className="w-full px-4 py-2 text-left text-body text-text-secondary hover:bg-bg-hover focus:bg-bg-hover focus:text-text-primary focus:outline-none max-md:min-h-control-lg"
              onClick={() => {
                close(true);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
