import React from 'react';
import { useMiddleware, FynModuleRuntime } from "@fynmesh/kernel";
import './styles.css';

// @ts-ignore
import { useState, useEffect } from 'react';

// Types/interfaces for components
type ReactNode = React.ReactNode;
type ButtonHTMLAttributes<T> = React.ButtonHTMLAttributes<T>;
type InputHTMLAttributes<T> = React.InputHTMLAttributes<T>;
type FC<P> = React.FC<P>;
const forwardRef = React.forwardRef;

// Button Component
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'outline' | 'danger';
    size?: 'small' | 'medium' | 'large';
    isLoading?: boolean;
    children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({
    children,
    variant = 'primary',
    size = 'medium',
    isLoading = false,
    disabled,
    className = '',
    ...props
}, ref) => {
    const sizeClasses = {
        small: 'py-1 px-3 text-sm',
        medium: 'py-2 px-4 text-base',
        large: 'py-3 px-6 text-lg',
    }[size];

    const variantClasses = {
        primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
        secondary: 'bg-gray-600 text-white hover:bg-gray-700 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2',
        outline: 'border-2 border-gray-300 bg-transparent text-gray-700 hover:bg-gray-50 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2',
        danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2',
    }[variant];

    const baseClasses = 'inline-flex items-center justify-center rounded-md font-medium transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed';

    const buttonStyle = {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 'var(--fynmesh-radius-md)',
        fontWeight: 'var(--fynmesh-font-weight-medium)',
        fontSize: size === 'small' ? 'var(--fynmesh-text-sm)' : size === 'large' ? 'var(--fynmesh-text-lg)' : 'var(--fynmesh-text-base)',
        padding: size === 'small' ? 'var(--fynmesh-spacing-xs) var(--fynmesh-spacing-md)' : size === 'large' ? 'var(--fynmesh-spacing-md) var(--fynmesh-spacing-xl)' : 'var(--fynmesh-spacing-sm) var(--fynmesh-spacing-lg)',
        border: 'none',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        outline: 'none',
        opacity: disabled || isLoading ? 0.5 : 1,
        backgroundColor: variant === 'primary' ? 'var(--fynmesh-color-primary)' : variant === 'secondary' ? 'var(--fynmesh-color-secondary)' : variant === 'danger' ? 'var(--fynmesh-color-danger)' : 'transparent',
        color: variant === 'outline' ? 'var(--fynmesh-color-dark)' : 'var(--fynmesh-color-light)',
        borderWidth: variant === 'outline' ? 'var(--fynmesh-border-2)' : '0',
        borderStyle: 'solid',
        borderColor: variant === 'outline' ? 'var(--fynmesh-color-secondary)' : 'transparent',
    };

    return (
        <button
            ref={ref}
            style={buttonStyle}
            className={className}
            disabled={disabled || isLoading}
            {...props}
        >
            {isLoading ? (
                <>
                    <span className="spinner spinner-small mr-2"></span>
                    <span>Loading...</span>
                </>
            ) : children}
        </button>
    );
});

Button.displayName = 'Button';

// Card Component
interface CardProps {
    children: ReactNode;
    title?: string;
    footer?: ReactNode;
    className?: string;
}

export const Card: FC<CardProps> = ({
    children,
    title,
    footer,
    className = ''
}) => {
    return (
        <div className={`card ${className}`}>
            {title && (
                <div className="card-header">
                    <h3 style={{
                        fontSize: 'var(--fynmesh-text-lg)',
                        fontWeight: 'var(--fynmesh-font-weight-medium)',
                        color: 'var(--fynmesh-color-dark)',
                        margin: 0,
                        fontFamily: 'var(--fynmesh-font-family-sans)'
                    }}>
                        {title} v1
                    </h3>
                </div>
            )}
            <div className="card-body">{children}</div>
            {footer && (
                <div className="card-footer">
                    {footer}
                </div>
            )}
        </div>
    );
};

// Input Component
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
    helperText?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({
    label,
    error,
    helperText,
    className = '',
    id,
    ...props
}, ref) => {
    const inputId = id || `input-${Math.random().toString(36).substring(2, 9)}`;

    return (
        <div style={{ marginBottom: 'var(--fynmesh-spacing-lg)' }}>
            {label && (
                <label
                    htmlFor={inputId}
                    style={{
                        display: 'block',
                        marginBottom: 'var(--fynmesh-spacing-sm)',
                        fontSize: 'var(--fynmesh-text-sm)',
                        fontWeight: 'var(--fynmesh-font-weight-medium)',
                        color: 'var(--fynmesh-color-dark)',
                        fontFamily: 'var(--fynmesh-font-family-sans)'
                    }}
                >
                    {label}
                </label>
            )}
            <input
                ref={ref}
                id={inputId}
                className={`input ${error ? 'input-error' : ''} ${className}`}
                {...props}
            />
            {error && (
                <p style={{
                    marginTop: 'var(--fynmesh-spacing-xs)',
                    fontSize: 'var(--fynmesh-text-sm)',
                    color: 'var(--fynmesh-color-danger)',
                    fontFamily: 'var(--fynmesh-font-family-sans)'
                }}>
                    {error}
                </p>
            )}
            {helperText && !error && (
                <p style={{
                    marginTop: 'var(--fynmesh-spacing-xs)',
                    fontSize: 'var(--fynmesh-text-sm)',
                    color: 'var(--fynmesh-color-secondary)',
                    fontFamily: 'var(--fynmesh-font-family-sans)'
                }}>
                    {helperText}
                </p>
            )}
        </div>
    );
});

Input.displayName = 'Input';

// Modal Component
interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    children: ReactNode;
    footer?: ReactNode;
}

export const Modal: FC<ModalProps> = ({
    isOpen,
    onClose,
    title,
    children,
    footer,
}) => {
    useEffect(() => {
        if (isOpen) {
            // Only prevent scrollbar jump without hiding the background
            const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
            document.body.style.paddingRight = `${scrollbarWidth}px`;
        } else {
            document.body.style.paddingRight = '';
        }

        return () => {
            document.body.style.paddingRight = '';
        };
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        }}>
            {/* Overlay with transparent background */}
            <div
                style={{
                    position: 'fixed',
                    inset: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    backdropFilter: 'none',
                    transition: 'opacity 0.2s ease'
                }}
                onClick={onClose}
            ></div>
            {/* Modal content */}
            <div style={{
                position: 'relative',
                zIndex: 50,
                width: '100%',
                maxWidth: '28rem',
                borderRadius: 'var(--fynmesh-radius-lg)',
                background: 'var(--fynmesh-color-light)',
                boxShadow: 'var(--fynmesh-shadow-xl)',
                margin: '0 auto'
            }}>
                {title && (
                    <div className="card-header">
                        <h3 style={{
                            fontSize: 'var(--fynmesh-text-lg)',
                            fontWeight: 'var(--fynmesh-font-weight-medium)',
                            color: 'var(--fynmesh-color-dark)',
                            margin: 0,
                            fontFamily: 'var(--fynmesh-font-family-sans)'
                        }}>
                            {title}
                        </h3>
                    </div>
                )}
                <div className="card-body">{children}</div>
                {footer && (
                    <div className="card-footer">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
};

// Alert Component
interface AlertProps {
    children: ReactNode;
    variant?: 'info' | 'success' | 'warning' | 'error';
    dismissible?: boolean;
    onDismiss?: () => void;
    className?: string;
}

export const Alert: FC<AlertProps> = ({
    children,
    variant = 'info',
    dismissible = false,
    onDismiss,
    className = '',
}) => {
    const [isVisible, setIsVisible] = useState(true);

    const handleDismiss = () => {
        setIsVisible(false);
        onDismiss?.();
    };

    if (!isVisible) return null;

    return (
        <div className={`alert alert-${variant} ${className}`} role="alert">
            <div style={{ display: 'flex' }}>
                <div style={{ flexGrow: 1 }}>{children}</div>
                {dismissible && (
                    <button
                        type="button"
                        style={{
                            marginLeft: 'auto',
                            display: 'inline-flex',
                            color: 'var(--fynmesh-color-secondary)',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            outline: 'none'
                        }}
                        onClick={handleDismiss}
                        aria-label="Dismiss"
                    >
                        <span className="sr-only">Dismiss</span>
                        <svg style={{ width: '1.25rem', height: '1.25rem' }} viewBox="0 0 20 20" fill="currentColor">
                            <path
                                fillRule="evenodd"
                                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                                clipRule="evenodd"
                            />
                        </svg>
                    </button>
                )}
            </div>
        </div>
    );
};

// Badge Component
interface BadgeProps {
    children: ReactNode;
    variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
    className?: string;
}

export const Badge: FC<BadgeProps> = ({
    children,
    variant = 'default',
    className = '',
}) => {
    const getVariantStyles = () => {
        switch (variant) {
            case 'primary':
                return {
                    background: 'rgba(37, 99, 235, 0.1)',
                    color: 'var(--fynmesh-color-primary)'
                };
            case 'success':
                return {
                    background: 'rgba(5, 150, 105, 0.1)',
                    color: 'var(--fynmesh-color-success)'
                };
            case 'warning':
                return {
                    background: 'rgba(217, 119, 6, 0.1)',
                    color: 'var(--fynmesh-color-warning)'
                };
            case 'danger':
                return {
                    background: 'rgba(220, 38, 38, 0.1)',
                    color: 'var(--fynmesh-color-danger)'
                };
            default:
                return {
                    background: 'rgba(100, 116, 139, 0.1)',
                    color: 'var(--fynmesh-color-secondary)'
                };
        }
    };

    const variantStyles = getVariantStyles();

    return (
        <span
            className={className}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: 'var(--fynmesh-spacing-xs) var(--fynmesh-spacing-sm)',
                borderRadius: 'var(--fynmesh-radius-full)',
                fontSize: 'var(--fynmesh-text-xs)',
                fontWeight: 'var(--fynmesh-font-weight-medium)',
                fontFamily: 'var(--fynmesh-font-family-sans)',
                ...variantStyles
            }}
        >
            {children}
        </span>
    );
};

// Spinner Component
interface SpinnerProps {
    size?: 'small' | 'medium' | 'large';
    color?: 'primary' | 'gray' | 'white';
    className?: string;
}

export const Spinner: FC<SpinnerProps> = ({
    size = 'medium',
    color = 'primary',
    className = '',
}) => {
    const sizeStyles = {
        small: { width: 'var(--fynmesh-spacing-lg)', height: 'var(--fynmesh-spacing-lg)' },
        medium: { width: 'var(--fynmesh-spacing-xl)', height: 'var(--fynmesh-spacing-xl)' },
        large: { width: 'var(--fynmesh-spacing-2xl)', height: 'var(--fynmesh-spacing-2xl)' },
    }[size];

    const colorStyles = {
        primary: { color: 'var(--fynmesh-color-primary)' },
        gray: { color: 'var(--fynmesh-color-secondary)' },
        white: { color: 'var(--fynmesh-color-light)' },
    }[color];

    return (
        <svg
            className={`spinner ${className}`}
            style={{
                ...sizeStyles,
                ...colorStyles
            }}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
        >
            <circle
                style={{ opacity: 0.25 }}
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
            />
            <path
                style={{ opacity: 0.75 }}
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
        </svg>
    );
};

// FynApp User for middleware
const fynappUser = {
    async execute(runtime: FynModuleRuntime) {
        // Get design tokens from middleware
        const designTokensContext = runtime.middlewareContext.get("design-tokens");
        const { api: designTokens } = designTokensContext || {};

        if (designTokens) {
            console.log("🎨 FynApp X1 v1 - Design tokens loaded");
            console.log("🎨 Current theme:", designTokens.getTheme());
            console.log("🎨 Available tokens:", designTokens.getTokens());

            // Subscribe to theme changes
            designTokens.subscribeToThemeChanges((theme: string, tokens: any) => {
                console.log(`🎨 FynApp X1 v1 - Theme changed to ${theme}`);
            });
        } else {
            console.warn("🚨 FynApp X1 v1 - Design tokens middleware not available");
        }
    },
};

// Export with middleware
export const main = useMiddleware(
    {
        info: {
            name: "design-tokens",
            provider: "fynapp-design-tokens",
            version: "^1.0.0",
        },
        config: {
            theme: "fynmesh-default",
            cssCustomProperties: true,
            cssVariablePrefix: "fynmesh",
            enableThemeSwitching: true,
            persistTheme: true,
        },
    },
    fynappUser,
);
