import React from 'react';
import { useMiddleware, FynModuleRuntime } from "@fynmesh/kernel";
import './styles.css';

// @ts-ignore
import { useState, useEffect } from 'react';
// @ts-ignore
import { createPortal } from 'react-dom';

// Types/interfaces for components
type ReactNode = React.ReactNode;
type ButtonHTMLAttributes<T> = React.ButtonHTMLAttributes<T>;
type InputHTMLAttributes<T> = React.InputHTMLAttributes<T>;
type FC<P = {}> = React.FC<P>;
const forwardRef = React.forwardRef;

// Button Component
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'success' | 'warning';
    size?: 'small' | 'medium' | 'large';
    isLoading?: boolean;
    icon?: ReactNode;
    iconPosition?: 'left' | 'right';
    children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({
    children,
    variant = 'primary',
    size = 'medium',
    isLoading = false,
    icon,
    iconPosition = 'left',
    disabled,
    className = '',
    ...props
}, ref) => {
    const getVariantStyles = () => {
        switch (variant) {
            case 'primary':
                return {
                    backgroundColor: 'var(--fynmesh-color-primary)',
                    color: 'var(--fynmesh-color-light)',
                    boxShadow: 'var(--fynmesh-shadow-sm)',
                };
            case 'secondary':
                return {
                    backgroundColor: 'var(--fynmesh-color-secondary)',
                    color: 'var(--fynmesh-color-light)',
                    boxShadow: 'var(--fynmesh-shadow-sm)',
                };
            case 'outline':
                return {
                    backgroundColor: 'rgba(0, 0, 0, 0.08)',
                    color: 'var(--fynmesh-color-dark)',
                    border: '2px solid var(--fynmesh-color-dark)',
                    boxShadow: 'var(--fynmesh-shadow-sm)',
                };
            case 'danger':
                return {
                    backgroundColor: 'var(--fynmesh-color-danger)',
                    color: 'var(--fynmesh-color-light)',
                    boxShadow: 'var(--fynmesh-shadow-sm)',
                };
            case 'success':
                return {
                    backgroundColor: 'var(--fynmesh-color-success)',
                    color: 'var(--fynmesh-color-light)',
                    boxShadow: 'var(--fynmesh-shadow-sm)',
                };
            case 'warning':
                return {
                    backgroundColor: 'var(--fynmesh-color-warning)',
                    color: 'var(--fynmesh-color-light)',
                    boxShadow: 'var(--fynmesh-shadow-sm)',
                };
            default:
                return {
                    backgroundColor: 'var(--fynmesh-color-primary)',
                    color: 'var(--fynmesh-color-light)',
                    boxShadow: 'var(--fynmesh-shadow-sm)',
                };
        }
    };

    const getSizeStyles = () => {
        switch (size) {
            case 'small':
                return {
                    padding: 'var(--fynmesh-spacing-xs) var(--fynmesh-spacing-md)',
                    fontSize: 'var(--fynmesh-text-sm)',
                };
            case 'large':
                return {
                    padding: 'var(--fynmesh-spacing-md) var(--fynmesh-spacing-xl)',
                    fontSize: 'var(--fynmesh-text-lg)',
                };
            default:
                return {
                    padding: 'var(--fynmesh-spacing-sm) var(--fynmesh-spacing-lg)',
                    fontSize: 'var(--fynmesh-text-base)',
                };
        }
    };

    const buttonStyle = {
        ...getVariantStyles(),
        ...getSizeStyles(),
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 'var(--fynmesh-radius-lg)',
        fontWeight: 'var(--fynmesh-font-weight-medium)',
        fontFamily: 'var(--fynmesh-font-family-sans)',
        transition: 'all 0.2s ease',
        cursor: 'pointer',
        border: variant === 'outline' ? undefined : 'none',
        outline: 'none',
        transform: 'scale(1)',
        opacity: disabled || isLoading ? 0.5 : 1,
    };

    return (
        <button
            ref={ref}
            style={buttonStyle}
            className={`button-v2 focus-ring ${className}`}
            disabled={disabled || isLoading}
            onMouseEnter={variant === 'outline' ? (e) => {
                if (!disabled && !isLoading) {
                    e.currentTarget.style.backgroundColor = 'var(--fynmesh-color-dark)';
                    e.currentTarget.style.color = 'var(--fynmesh-color-light)';
                    e.currentTarget.style.borderColor = 'var(--fynmesh-color-dark)';
                }
            } : undefined}
            onMouseLeave={variant === 'outline' ? (e) => {
                if (!disabled && !isLoading) {
                    e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.08)';
                    e.currentTarget.style.color = 'var(--fynmesh-color-dark)';
                    e.currentTarget.style.borderColor = 'var(--fynmesh-color-dark)';
                }
            } : undefined}
            {...props}
        >
            {isLoading ? (
                <>
                    <span className="spinner-v2" style={{
                        width: 'var(--fynmesh-spacing-lg)',
                        height: 'var(--fynmesh-spacing-lg)',
                        marginRight: 'var(--fynmesh-spacing-sm)',
                        color: 'currentColor'
                    }}>
                        <svg fill="none" viewBox="0 0 24 24">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" style={{ opacity: 0.25 }} />
                            <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" style={{ opacity: 0.75 }} />
                        </svg>
                    </span>
                    <span>Loading...</span>
                </>
            ) : (
                <>
                    {icon && iconPosition === 'left' && <span style={{ marginRight: 'var(--fynmesh-spacing-sm)' }}>{icon}</span>}
                    {children}
                    {icon && iconPosition === 'right' && <span style={{ marginLeft: 'var(--fynmesh-spacing-sm)' }}>{icon}</span>}
                </>
            )}
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
    variant?: 'default' | 'bordered' | 'elevated';
    headerAction?: ReactNode;
}

export const Card: FC<CardProps> = ({
    children,
    title,
    footer,
    className = '',
    variant = 'default',
    headerAction,
}) => {
    const getVariantStyles = () => {
        switch (variant) {
            case 'bordered':
                return {
                    backgroundColor: 'var(--fynmesh-color-light)',
                    border: 'var(--fynmesh-border-1) solid var(--fynmesh-color-secondary)',
                };
            case 'elevated':
                return {
                    backgroundColor: 'var(--fynmesh-color-light)',
                    boxShadow: 'var(--fynmesh-shadow-lg)',
                };
            default:
                return {
                    backgroundColor: 'var(--fynmesh-color-light)',
                };
        }
    };

    const cardStyle = {
        ...getVariantStyles(),
        borderRadius: 'var(--fynmesh-radius-xl)',
        overflow: 'hidden',
    };

    return (
        <div style={cardStyle} className={className}>
            {title && (
                <div className="card-header">
                    <h3 style={{
                        fontSize: 'var(--fynmesh-text-lg)',
                        fontWeight: 'var(--fynmesh-font-weight-semibold)',
                        color: 'var(--fynmesh-color-dark)',
                        margin: 0,
                        fontFamily: 'var(--fynmesh-font-family-sans)'
                    }}>
                        {title}
                    </h3>
                    {headerAction && <div>{headerAction}</div>}
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
    icon?: ReactNode;
    iconPosition?: 'left' | 'right';
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({
    label,
    error,
    helperText,
    className = '',
    id,
    icon,
    iconPosition = 'left',
    ...props
}, ref) => {
    const inputId = id || `input-${Math.random().toString(36).substring(2, 9)}`;

    const inputClasses = [
        'input-v2',
        error ? 'input-v2-error' : '',
        icon && iconPosition === 'left' ? 'input-v2-with-icon-left' : '',
        icon && iconPosition === 'right' ? 'input-v2-with-icon-right' : '',
        className
    ].filter(Boolean).join(' ');

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
            <div style={{ position: 'relative' }}>
                {icon && iconPosition === 'left' && (
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: 0,
                        paddingLeft: 'var(--fynmesh-spacing-md)',
                        display: 'flex',
                        alignItems: 'center',
                        pointerEvents: 'none'
                    }}>
                        {icon}
                    </div>
                )}
                <input
                    ref={ref}
                    id={inputId}
                    className={inputClasses}
                    {...props}
                />
                {icon && iconPosition === 'right' && (
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        right: 0,
                        paddingRight: 'var(--fynmesh-spacing-md)',
                        display: 'flex',
                        alignItems: 'center',
                        pointerEvents: 'none'
                    }}>
                        {icon}
                    </div>
                )}
            </div>
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
    size?: 'small' | 'medium' | 'large';
    closeOnOverlayClick?: boolean;
    overlayOpacity?: number;
    overlayBlur?: string;
}

export const Modal: FC<ModalProps> = ({
    isOpen,
    onClose,
    title,
    children,
    footer,
    size = 'medium',
    closeOnOverlayClick = true,
    overlayOpacity = 0.5,
    overlayBlur = 'blur(2px)',
}) => {
    useEffect(() => {
        if (isOpen) {
            // Prevent body scroll when modal is open
            document.body.style.overflow = 'hidden';
            const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
            document.body.style.paddingRight = `${scrollbarWidth}px`;
        } else {
            // Restore body scroll when modal is closed
            document.body.style.overflow = '';
            document.body.style.paddingRight = '';
        }

        return () => {
            // Cleanup on unmount
            document.body.style.overflow = '';
            document.body.style.paddingRight = '';
        };
    }, [isOpen]);

    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
        }

        return () => {
            document.removeEventListener('keydown', handleEscape);
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const getMaxWidth = () => {
        switch (size) {
            case 'small': return '24rem';
            case 'large': return '32rem';
            default: return '28rem';
        }
    };

    const modalContent = (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'var(--fynmesh-spacing-lg)'
        }}>
            {/* Full-screen overlay */}
            <div
                className="modal-overlay-v2"
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: `rgba(0, 0, 0, ${overlayOpacity})`,
                    backdropFilter: overlayBlur,
                    transition: 'all 0.2s ease'
                }}
                onClick={closeOnOverlayClick ? onClose : undefined}
            />

            {/* Modal content */}
            <div
                className="modal-content-v2"
                style={{
                    position: 'relative',
                    zIndex: 10000,
                    width: '100%',
                    maxWidth: getMaxWidth(),
                    margin: '0 auto',
                    transform: 'scale(1)',
                    transition: 'all 0.3s ease-in-out',
                    maxHeight: '90vh',
                    overflow: 'auto'
                }}
            >
                {title && (
                    <div className="card-header" style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                    }}>
                        <h3 style={{
                            fontSize: 'var(--fynmesh-text-lg)',
                            fontWeight: 'var(--fynmesh-font-weight-semibold)',
                            color: 'var(--fynmesh-color-dark)',
                            margin: 0,
                            fontFamily: 'var(--fynmesh-font-family-sans)'
                        }}>
                            {title}
                        </h3>
                        <button
                            onClick={onClose}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--fynmesh-color-secondary)',
                                cursor: 'pointer',
                                padding: 'var(--fynmesh-spacing-xs)',
                                borderRadius: 'var(--fynmesh-radius-sm)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                outline: 'none',
                                transition: 'all 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.color = 'var(--fynmesh-color-dark)';
                                e.currentTarget.style.backgroundColor = 'var(--fynmesh-color-secondary)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.color = 'var(--fynmesh-color-secondary)';
                                e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                            aria-label="Close modal"
                        >
                            <span style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 }}>Close</span>
                            <svg style={{ width: '1.5rem', height: '1.5rem' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
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

    // Render modal content using Portal to document.body
    return createPortal(modalContent, document.body);
};

// Alert Component
interface AlertProps {
    children: ReactNode;
    variant?: 'info' | 'success' | 'warning' | 'error';
    dismissible?: boolean;
    onDismiss?: () => void;
    className?: string;
    icon?: ReactNode;
}

export const Alert: FC<AlertProps> = ({
    children,
    variant = 'info',
    dismissible = false,
    onDismiss,
    className = '',
    icon,
}) => {
    const [isVisible, setIsVisible] = useState(true);

    const handleDismiss = () => {
        setIsVisible(false);
        onDismiss?.();
    };

    if (!isVisible) return null;

    const alertClass = `alert-v2 alert-v2-${variant} ${className}`;

    return (
        <div className={alertClass} role="alert">
            {icon && <div style={{ flexShrink: 0 }}>{icon}</div>}
            <div style={{ flexGrow: 1 }}>{children}</div>
            {dismissible && (
                <button
                    type="button"
                    onClick={handleDismiss}
                    style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'currentColor',
                        cursor: 'pointer',
                        opacity: 0.7,
                        outline: 'none',
                        flexShrink: 0
                    }}
                    aria-label="Dismiss"
                >
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
    );
};

// Badge Component
interface BadgeProps {
    children: ReactNode;
    variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
    className?: string;
    size?: 'small' | 'medium' | 'large';
    dot?: boolean;
}

export const Badge: FC<BadgeProps> = ({
    children,
    variant = 'default',
    className = '',
    size = 'medium',
    dot = false,
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

    const badgeClass = `badge-v2 badge-v2-${size} ${className}`;
    const variantStyles = getVariantStyles();

    return (
        <span className={badgeClass} style={variantStyles}>
            {dot && (
                <span style={{
                    width: 'var(--fynmesh-spacing-xs)',
                    height: 'var(--fynmesh-spacing-xs)',
                    backgroundColor: 'currentColor',
                    borderRadius: 'var(--fynmesh-radius-full)',
                }} />
            )}
            {children}
        </span>
    );
};

// Spinner Component
interface SpinnerProps {
    size?: 'small' | 'medium' | 'large';
    color?: 'primary' | 'gray' | 'white';
    className?: string;
    variant?: 'default' | 'dots' | 'pulse';
}

export const Spinner: FC<SpinnerProps> = ({
    size = 'medium',
    color = 'primary',
    className = '',
    variant = 'default',
}) => {
    const getSizeStyles = () => {
        switch (size) {
            case 'small':
                return { width: 'var(--fynmesh-spacing-lg)', height: 'var(--fynmesh-spacing-lg)' };
            case 'large':
                return { width: 'var(--fynmesh-spacing-2xl)', height: 'var(--fynmesh-spacing-2xl)' };
            default:
                return { width: 'var(--fynmesh-spacing-xl)', height: 'var(--fynmesh-spacing-xl)' };
        }
    };

    const getColorStyles = () => {
        switch (color) {
            case 'gray':
                return { color: 'var(--fynmesh-color-secondary)' };
            case 'white':
                return { color: 'var(--fynmesh-color-light)' };
            default:
                return { color: 'var(--fynmesh-color-primary)' };
        }
    };

    const spinnerClass = `spinner-v2${variant !== 'default' ? `-${variant}` : ''} ${className}`;
    const styles = { ...getSizeStyles(), ...getColorStyles() };

    if (variant === 'dots') {
        return (
            <div className={spinnerClass} style={styles}>
                <div style={{ display: 'flex', gap: 'var(--fynmesh-spacing-xs)' }}>
                    <div style={{
                        width: 'var(--fynmesh-spacing-xs)',
                        height: 'var(--fynmesh-spacing-xs)',
                        backgroundColor: 'currentColor',
                        borderRadius: 'var(--fynmesh-radius-full)',
                        animationDelay: '0s'
                    }} />
                    <div style={{
                        width: 'var(--fynmesh-spacing-xs)',
                        height: 'var(--fynmesh-spacing-xs)',
                        backgroundColor: 'currentColor',
                        borderRadius: 'var(--fynmesh-radius-full)',
                        animationDelay: '0.2s'
                    }} />
                    <div style={{
                        width: 'var(--fynmesh-spacing-xs)',
                        height: 'var(--fynmesh-spacing-xs)',
                        backgroundColor: 'currentColor',
                        borderRadius: 'var(--fynmesh-radius-full)',
                        animationDelay: '0.4s'
                    }} />
                </div>
            </div>
        );
    }

    if (variant === 'pulse') {
        return (
            <div className={spinnerClass} style={styles}>
                <div style={{
                    width: '100%',
                    height: '100%',
                    backgroundColor: 'currentColor',
                    borderRadius: 'var(--fynmesh-radius-full)',
                }} />
            </div>
        );
    }

    return (
        <svg
            className={spinnerClass}
            style={styles}
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
            console.log("🎨 FynApp X1 v2 - Design tokens loaded");
            console.log("🎨 Current theme:", designTokens.getTheme());
            console.log("🎨 Available tokens:", designTokens.getTokens());

            // Enable global theme acceptance so this component library updates when other apps change themes
            designTokens.setGlobalOptIn(true);
            console.log("🎨 FynApp X1 v2 - Enabled global theme acceptance");

            // Subscribe to theme changes
            designTokens.subscribeToThemeChanges((theme: string, tokens: any) => {
                console.log(`🎨 FynApp X1 v2 - Theme changed to ${theme}`);
            });
        } else {
            console.warn("🚨 FynApp X1 v2 - Design tokens middleware not available");
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
            global: true, // Apply CSS to this app's scope, not globally
        },
    },
    fynappUser,
);
