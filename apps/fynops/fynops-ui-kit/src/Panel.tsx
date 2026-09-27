import React from "react";

export interface PanelProps {
  title?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

/** A bordered card with an optional header (title + actions) and a body. */
export const Panel: React.FC<PanelProps> = ({ title, actions, children, className }) => {
  const classes = ["fo-ui-panel", className].filter(Boolean).join(" ");
  return (
    <div className={classes}>
      {(title || actions) && (
        <div className="fo-ui-panel-header">
          {title && <h3 className="fo-ui-panel-title">{title}</h3>}
          {actions && <div className="fo-ui-panel-actions">{actions}</div>}
        </div>
      )}
      <div className="fo-ui-panel-body">{children}</div>
    </div>
  );
};
