import React from 'react';

// @ts-ignore
import { useState, useEffect } from 'react';
// @ts-ignore
import { createPortal } from 'react-dom';

import { useMiddleware, FynModuleRuntime } from "@fynmesh/kernel";

import {
    ReactNode, FC,
    BaseButtonProps, ButtonStyleConfig,
    BaseCardProps, CardStyleConfig,
    BaseInputProps, InputStyleConfig,
    BaseModalProps, ModalStyleConfig,
    BaseAlertProps, AlertStyleConfig,
    BaseBadgeProps, BadgeStyleConfig,
    BaseSpinnerProps, SpinnerStyleConfig,
    MiddlewareConfig,
} from './types.ts';

import {
    getButtonSizeStyles,
    getBadgeVariantStyles,
    getSpinnerSizeStyles,
    getSpinnerColorStyles,
    labelStyle,
    errorTextStyle,
    helperTextStyle,
    modalOverlayBaseStyle,
    modalBackdropBaseStyle,
    getModalContentBaseStyle,
    modalTitleBaseStyle,
    modalCloseButtonStyle,
    cardTitleStyle,
    outlineMouseEnter,
    outlineMouseLeave,
    closeButtonMouseEnter,
    closeButtonMouseLeave,
    dismissSvgPath,
} from './styles.ts';

const forwardRef = React.forwardRef;

// ---- Button Factory ----

export function createButton<P extends BaseButtonProps>(config: ButtonStyleConfig) {
    const Component = forwardRef<HTMLButtonElement, P>(({
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
        const variantStyles = config.getVariantStyles(variant as string);
        const sizeStyles = getButtonSizeStyles(size);

        const buttonStyle: React.CSSProperties = {
            ...variantStyles,
            ...sizeStyles,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: config.borderRadius,
            fontWeight: 'var(--fynmesh-font-weight-medium)',
            fontFamily: 'var(--fynmesh-font-family-sans)',
            transition: 'all 0.2s ease',
            cursor: 'pointer',
            border: (variant === 'outline') ? undefined : 'none',
            outline: 'none',
            opacity: disabled || isLoading ? 0.5 : 1,
        };

        return (
            <button
                ref={ref}
                style={buttonStyle}
                className={`${config.className} ${className}`.trim()}
                disabled={disabled || isLoading}
                onMouseEnter={variant === 'outline' ? outlineMouseEnter(!!disabled, isLoading) : undefined}
                onMouseLeave={variant === 'outline' ? outlineMouseLeave(!!disabled, isLoading) : undefined}
                {...props}
            >
                {isLoading
                    ? config.renderLoading()
                    : config.renderContent(children, icon, iconPosition)}
            </button>
        );
    });

    Component.displayName = 'Button';
    return Component;
}

// ---- Card Factory ----

export function createCard<P extends BaseCardProps>(config: CardStyleConfig): FC<P> {
    const Component: FC<P> = ({
        children,
        title,
        footer,
        className = '',
        variant = 'default',
        headerAction,
    }: any) => {
        const variantStyles = config.getVariantStyles(variant);

        return (
            <div style={variantStyles} className={`${config.className} ${className}`.trim()}>
                {title && (
                    <div className="card-header">
                        <h3 style={cardTitleStyle(config.titleFontWeight)}>
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

    return Component;
}

// ---- Input Factory ----

export function createInput<P extends BaseInputProps>(config: InputStyleConfig) {
    const Component = forwardRef<HTMLInputElement, P>(({
        label,
        error,
        helperText,
        className = '',
        id,
        icon,
        iconPosition = 'left',
        ...props
    }: any, ref) => {
        const inputId = id || `input-${Math.random().toString(36).substring(2, 9)}`;
        const inputClasses = config.getInputClassName(error, icon, iconPosition);
        const finalClassName = `${inputClasses} ${className}`.trim();

        return (
            <div style={{ marginBottom: 'var(--fynmesh-spacing-lg)' }}>
                {label && (
                    <label htmlFor={inputId} style={labelStyle}>
                        {label}
                    </label>
                )}
                <div style={{ position: 'relative' }}>
                    {config.supportsIcon && icon && iconPosition === 'left' && (
                        <div style={{
                            position: 'absolute',
                            top: 0,
                            bottom: 0,
                            left: 0,
                            paddingLeft: 'var(--fynmesh-spacing-md)',
                            display: 'flex',
                            alignItems: 'center',
                            pointerEvents: 'none',
                        }}>
                            {icon}
                        </div>
                    )}
                    <input
                        ref={ref}
                        id={inputId}
                        className={finalClassName}
                        {...props}
                    />
                    {config.supportsIcon && icon && iconPosition === 'right' && (
                        <div style={{
                            position: 'absolute',
                            top: 0,
                            bottom: 0,
                            right: 0,
                            paddingRight: 'var(--fynmesh-spacing-md)',
                            display: 'flex',
                            alignItems: 'center',
                            pointerEvents: 'none',
                        }}>
                            {icon}
                        </div>
                    )}
                </div>
                {error && <p style={errorTextStyle}>{error}</p>}
                {helperText && !error && <p style={helperTextStyle}>{helperText}</p>}
            </div>
        );
    });

    Component.displayName = 'Input';
    return Component;
}

// ---- Modal Factory ----

export function createModal<P extends BaseModalProps>(config: ModalStyleConfig): FC<P> {
    const Component: FC<P> = ({
        isOpen,
        onClose,
        title,
        children,
        footer,
        size = 'medium',
        closeOnOverlayClick = true,
        overlayOpacity = 0.5,
        overlayBlur = 'blur(2px)',
    }: any) => {
        useEffect(() => {
            if (isOpen) {
                document.body.style.overflow = 'hidden';
                const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
                document.body.style.paddingRight = `${scrollbarWidth}px`;
            } else {
                document.body.style.overflow = '';
                document.body.style.paddingRight = '';
            }
            return () => {
                document.body.style.overflow = '';
                document.body.style.paddingRight = '';
            };
        }, [isOpen]);

        useEffect(() => {
            const handleEscape = (e: KeyboardEvent) => {
                if (e.key === 'Escape') onClose();
            };
            if (isOpen) {
                document.addEventListener('keydown', handleEscape);
            }
            return () => {
                document.removeEventListener('keydown', handleEscape);
            };
        }, [isOpen, onClose]);

        if (!isOpen) return null;

        const maxWidth = config.getMaxWidth(size);

        const modalContent = (
            <div style={modalOverlayBaseStyle}>
                {/* Overlay backdrop */}
                <div
                    className={config.overlayClassName}
                    style={{
                        ...modalBackdropBaseStyle,
                        backgroundColor: `rgba(0, 0, 0, ${overlayOpacity})`,
                        backdropFilter: overlayBlur,
                    }}
                    onClick={closeOnOverlayClick ? onClose : undefined}
                />

                {/* Modal panel */}
                <div
                    className={config.contentClassName}
                    style={{
                        ...getModalContentBaseStyle(maxWidth),
                        ...config.contentPanelStyle,
                    }}
                >
                    {title && (
                        <div className="card-header" style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                        }}>
                            <h3 style={modalTitleBaseStyle(config.titleFontWeight)}>
                                {title}
                            </h3>
                            <button
                                onClick={onClose}
                                style={modalCloseButtonStyle}
                                onMouseEnter={closeButtonMouseEnter}
                                onMouseLeave={closeButtonMouseLeave}
                                aria-label="Close modal"
                            >
                                {config.renderCloseIcon()}
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

        return createPortal(modalContent, document.body);
    };

    return Component;
}

// ---- Alert Factory ----

export function createAlert<P extends BaseAlertProps>(config: AlertStyleConfig): FC<P> {
    const Component: FC<P> = ({
        children,
        variant = 'info',
        dismissible = false,
        onDismiss,
        className = '',
        icon,
    }: any) => {
        const [isVisible, setIsVisible] = useState(true);

        const handleDismiss = () => {
            setIsVisible(false);
            onDismiss?.();
        };

        if (!isVisible) return null;

        const alertClassName = config.getClassName(variant, className);

        return (
            <div className={alertClassName} role="alert">
                {config.supportsIcon && icon && <div style={{ flexShrink: 0 }}>{icon}</div>}
                <div style={{ display: 'flex', flexGrow: 1 }}>
                    <div style={{ flexGrow: 1 }}>{children}</div>
                </div>
                {dismissible && (
                    <button
                        type="button"
                        onClick={handleDismiss}
                        style={config.dismissButtonStyle}
                        aria-label="Dismiss"
                    >
                        <span className="sr-only">Dismiss</span>
                        <svg style={{ width: '1.25rem', height: '1.25rem' }} viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d={dismissSvgPath} clipRule="evenodd" />
                        </svg>
                    </button>
                )}
            </div>
        );
    };

    return Component;
}

// ---- Badge Factory ----

export function createBadge<P extends BaseBadgeProps>(config: BadgeStyleConfig): FC<P> {
    const Component: FC<P> = ({
        children,
        variant = 'default',
        className = '',
        size = 'medium',
        dot = false,
    }: any) => {
        const badgeClassName = config.getClassName(variant, size, className);
        const inlineStyles = config.usesInlineStyles
            ? config.getInlineStyles(variant)
            : getBadgeVariantStyles(variant);

        return (
            <span className={badgeClassName} style={inlineStyles}>
                {config.supportsDot && dot && (
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

    return Component;
}

// ---- Spinner Factory ----

export function createSpinner<P extends BaseSpinnerProps>(config: SpinnerStyleConfig): FC<P> {
    const Component: FC<P> = ({
        size = 'medium',
        color = 'primary',
        className = '',
        variant = 'default',
    }: any) => {
        const styles: React.CSSProperties = {
            ...getSpinnerSizeStyles(size),
            ...getSpinnerColorStyles(color),
        };
        const spinnerClassName = config.getClassName(variant, className);

        if (config.supportsVariants && variant === 'dots' && config.renderDots) {
            return config.renderDots(styles) as React.ReactElement;
        }

        if (config.supportsVariants && variant === 'pulse' && config.renderPulse) {
            return config.renderPulse(styles) as React.ReactElement;
        }

        return (
            <svg
                className={spinnerClassName}
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

    return Component;
}

// ---- Middleware Factory ----

export function createFynAppMiddleware(mwConfig: MiddlewareConfig) {
    const log = mwConfig.useDebug ? console.debug : console.log;

    const fynappUser = {
        async execute(runtime: FynModuleRuntime) {
            const designTokensContext = runtime.middlewareContext.get("design-tokens");
            const { api: designTokens } = designTokensContext || {};

            if (designTokens) {
                log(`\u{1F3A8} ${mwConfig.displayName} - Design tokens loaded`);
                log(`\u{1F3A8} Current theme:`, designTokens.getTheme());
                log(`\u{1F3A8} Available tokens:`, designTokens.getTokens());

                designTokens.setGlobalOptIn(true);
                log(`\u{1F3A8} ${mwConfig.displayName} - Enabled global theme acceptance`);

                designTokens.subscribeToThemeChanges((theme: string, _tokens: any) => {
                    log(`\u{1F3A8} ${mwConfig.displayName} - Theme changed to ${theme}`);
                });
            } else {
                console.warn(`\u{1F6A8} ${mwConfig.displayName} - Design tokens middleware not available`);
            }
        },
    };

    return useMiddleware(
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
                global: true,
            },
        },
        fynappUser,
    );
}
