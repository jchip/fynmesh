import React from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/** A button in one of three visual variants and three sizes. */
export const Button: React.FC<ButtonProps> = ({
  variant = "primary",
  size = "md",
  className,
  ...rest
}) => {
  const classes = ["fo-ui-btn", `fo-ui-btn--${variant}`, `fo-ui-btn--${size}`, className]
    .filter(Boolean)
    .join(" ");
  return <button className={classes} {...rest} />;
};
