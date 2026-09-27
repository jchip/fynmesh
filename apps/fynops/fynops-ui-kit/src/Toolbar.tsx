import React from "react";

export interface ToolbarProps {
  children?: React.ReactNode;
  className?: string;
}

/** A horizontal, wrapping row for grouping buttons and other controls. */
export const Toolbar: React.FC<ToolbarProps> = ({ children, className }) => {
  const classes = ["fo-ui-toolbar", className].filter(Boolean).join(" ");
  return <div className={classes}>{children}</div>;
};
