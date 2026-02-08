import React from 'react';

// Shared React type aliases
export type ReactNode = React.ReactNode;
export type ButtonHTMLAttributes<T> = React.ButtonHTMLAttributes<T>;
export type InputHTMLAttributes<T> = React.InputHTMLAttributes<T>;
export type FC<P = {}> = React.FC<P>;

// ---- Button ----

export interface BaseButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: string;
    size?: 'small' | 'medium' | 'large';
    isLoading?: boolean;
    icon?: ReactNode;
    iconPosition?: 'left' | 'right';
    children?: ReactNode;
}

export interface ButtonStyleConfig {
    getVariantStyles: (variant: string) => React.CSSProperties;
    borderRadius: string;
    className: string;
    renderLoading: () => ReactNode;
    renderContent: (children: ReactNode, icon?: ReactNode, iconPosition?: 'left' | 'right') => ReactNode;
}

// ---- Card ----

export interface BaseCardProps {
    children: ReactNode;
    title?: string;
    footer?: ReactNode;
    className?: string;
    variant?: string;
    headerAction?: ReactNode;
}

export interface CardStyleConfig {
    getVariantStyles: (variant: string) => React.CSSProperties;
    titleFontWeight: string;
    className: string;
}

// ---- Input ----

export interface BaseInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
    helperText?: string;
    icon?: ReactNode;
    iconPosition?: 'left' | 'right';
}

export interface InputStyleConfig {
    getInputClassName: (error?: string, icon?: ReactNode, iconPosition?: string) => string;
    supportsIcon: boolean;
}

// ---- Modal ----

export interface BaseModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    children: ReactNode;
    footer?: ReactNode;
    size?: 'small' | 'medium' | 'large';
    closeOnOverlayClick?: boolean;
    overlayOpacity?: number;
    overlayBlur?: string;
}

export interface ModalStyleConfig {
    getMaxWidth: (size: string) => string;
    overlayClassName: string;
    contentClassName: string;
    titleFontWeight: string;
    renderCloseIcon: () => ReactNode;
    contentPanelStyle: React.CSSProperties;
}

// ---- Alert ----

export interface BaseAlertProps {
    children: ReactNode;
    variant?: 'info' | 'success' | 'warning' | 'error';
    dismissible?: boolean;
    onDismiss?: () => void;
    className?: string;
    icon?: ReactNode;
}

export interface AlertStyleConfig {
    getClassName: (variant: string, className: string) => string;
    dismissButtonStyle: React.CSSProperties;
    supportsIcon: boolean;
}

// ---- Badge ----

export interface BaseBadgeProps {
    children: ReactNode;
    variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
    className?: string;
    size?: 'small' | 'medium' | 'large';
    dot?: boolean;
}

export interface BadgeStyleConfig {
    getClassName: (variant: string, size: string, className: string) => string;
    usesInlineStyles: boolean;
    getInlineStyles: (variant: string) => React.CSSProperties;
    supportsDot: boolean;
}

// ---- Spinner ----

export interface BaseSpinnerProps {
    size?: 'small' | 'medium' | 'large';
    color?: 'primary' | 'gray' | 'white';
    className?: string;
    variant?: 'default' | 'dots' | 'pulse';
}

export interface SpinnerStyleConfig {
    getClassName: (variant: string, className: string) => string;
    supportsVariants: boolean;
    renderDots?: (styles: React.CSSProperties) => ReactNode;
    renderPulse?: (styles: React.CSSProperties) => ReactNode;
}

// ---- Middleware ----

export interface MiddlewareConfig {
    displayName: string;
    useDebug?: boolean;
}
