import React from 'react';
import './styles.css';

import {
    createButton,
    createCard,
    createInput,
    createModal,
    createAlert,
    createBadge,
    createSpinner,
    createFynAppMiddleware,
} from '../../shared-demo-utils/x1-components/base-components';

import {
    BaseButtonProps,
    BaseCardProps,
    BaseInputProps,
    BaseModalProps,
    BaseAlertProps,
    BaseBadgeProps,
    BaseSpinnerProps,
} from '../../shared-demo-utils/x1-components/types';

// @ts-ignore
type ReactNode = React.ReactNode;

// ---- v2 Button ----

interface ButtonProps extends BaseButtonProps {
    variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'success' | 'warning';
}

function getV2ButtonVariantStyles(variant: string): React.CSSProperties {
    switch (variant) {
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
        default: // primary
            return {
                backgroundColor: 'var(--fynmesh-color-primary)',
                color: 'var(--fynmesh-color-light)',
                boxShadow: 'var(--fynmesh-shadow-sm)',
            };
    }
}

export const Button = createButton<ButtonProps>({
    getVariantStyles: getV2ButtonVariantStyles,
    borderRadius: 'var(--fynmesh-radius-lg)',
    className: 'button-v2 focus-ring',
    renderLoading: () => (
        <>
            <span className="spinner-v2" style={{
                width: 'var(--fynmesh-spacing-lg)',
                height: 'var(--fynmesh-spacing-lg)',
                marginRight: 'var(--fynmesh-spacing-sm)',
                color: 'currentColor',
            }}>
                <svg fill="none" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" style={{ opacity: 0.25 }} />
                    <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" style={{ opacity: 0.75 }} />
                </svg>
            </span>
            <span>Loading...</span>
        </>
    ),
    renderContent: (children: ReactNode, icon?: ReactNode, iconPosition?: 'left' | 'right') => (
        <>
            {icon && iconPosition === 'left' && <span style={{ marginRight: 'var(--fynmesh-spacing-sm)' }}>{icon}</span>}
            {children}
            {icon && iconPosition === 'right' && <span style={{ marginLeft: 'var(--fynmesh-spacing-sm)' }}>{icon}</span>}
        </>
    ),
});

// ---- v2 Card ----

interface CardProps extends BaseCardProps {
    variant?: 'default' | 'bordered' | 'elevated';
}

function getV2CardVariantStyles(variant: string): React.CSSProperties {
    switch (variant) {
        case 'bordered':
            return {
                backgroundColor: 'var(--fynmesh-color-light)',
                border: 'var(--fynmesh-border-1) solid var(--fynmesh-color-secondary)',
                borderRadius: 'var(--fynmesh-radius-xl)',
                overflow: 'hidden',
            };
        case 'elevated':
            return {
                backgroundColor: 'var(--fynmesh-color-light)',
                boxShadow: 'var(--fynmesh-shadow-lg)',
                borderRadius: 'var(--fynmesh-radius-xl)',
                overflow: 'hidden',
            };
        default:
            return {
                backgroundColor: 'var(--fynmesh-color-light)',
                borderRadius: 'var(--fynmesh-radius-xl)',
                overflow: 'hidden',
            };
    }
}

export const Card = createCard<CardProps>({
    getVariantStyles: getV2CardVariantStyles,
    titleFontWeight: 'var(--fynmesh-font-weight-semibold)',
    className: '',
});

// ---- v2 Input ----

interface InputProps extends BaseInputProps {}

export const Input = createInput<InputProps>({
    getInputClassName: (error?: string, icon?: ReactNode, iconPosition?: string) => {
        const classes = [
            'input-v2',
            error ? 'input-v2-error' : '',
            icon && iconPosition === 'left' ? 'input-v2-with-icon-left' : '',
            icon && iconPosition === 'right' ? 'input-v2-with-icon-right' : '',
        ];
        return classes.filter(Boolean).join(' ');
    },
    supportsIcon: true,
});

// ---- v2 Modal ----

interface ModalProps extends BaseModalProps {}

export const Modal = createModal<ModalProps>({
    getMaxWidth: (size: string) => {
        switch (size) {
            case 'small': return '24rem';
            case 'large': return '32rem';
            default: return '28rem';
        }
    },
    overlayClassName: 'modal-overlay-v2',
    contentClassName: 'modal-content-v2',
    titleFontWeight: 'var(--fynmesh-font-weight-semibold)',
    renderCloseIcon: () => (
        <>
            <span style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 }}>Close</span>
            <svg style={{ width: '1.5rem', height: '1.5rem' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
        </>
    ),
    contentPanelStyle: {
        transform: 'scale(1)',
        transition: 'all 0.3s ease-in-out',
    },
});

// ---- v2 Alert ----

interface AlertProps extends BaseAlertProps {}

export const Alert = createAlert<AlertProps>({
    getClassName: (variant: string, className: string) =>
        `alert-v2 alert-v2-${variant} ${className}`.trim(),
    dismissButtonStyle: {
        background: 'transparent',
        border: 'none',
        color: 'currentColor',
        cursor: 'pointer',
        opacity: 0.7,
        outline: 'none',
        flexShrink: 0,
    },
    supportsIcon: true,
});

// ---- v2 Badge ----

interface BadgeProps extends BaseBadgeProps {}

export const Badge = createBadge<BadgeProps>({
    getClassName: (variant: string, size: string, className: string) =>
        `badge-v2 badge-v2-${size} ${className}`.trim(),
    usesInlineStyles: false,
    getInlineStyles: () => ({}),
    supportsDot: true,
});

// ---- v2 Spinner ----

interface SpinnerProps extends BaseSpinnerProps {}

export const Spinner = createSpinner<SpinnerProps>({
    getClassName: (variant: string, className: string) =>
        `spinner-v2${variant !== 'default' ? `-${variant}` : ''} ${className}`.trim(),
    supportsVariants: true,
    renderDots: (styles: React.CSSProperties) => (
        <div className="spinner-v2-dots" style={styles}>
            <div style={{ display: 'flex', gap: 'var(--fynmesh-spacing-xs)' }}>
                {[0, 0.2, 0.4].map((delay, i) => (
                    <div key={i} style={{
                        width: 'var(--fynmesh-spacing-xs)',
                        height: 'var(--fynmesh-spacing-xs)',
                        backgroundColor: 'currentColor',
                        borderRadius: 'var(--fynmesh-radius-full)',
                        animationDelay: `${delay}s`,
                    }} />
                ))}
            </div>
        </div>
    ),
    renderPulse: (styles: React.CSSProperties) => (
        <div className="spinner-v2-pulse" style={styles}>
            <div style={{
                width: '100%',
                height: '100%',
                backgroundColor: 'currentColor',
                borderRadius: 'var(--fynmesh-radius-full)',
            }} />
        </div>
    ),
});

// ---- Middleware ----

export const main = createFynAppMiddleware({
    displayName: 'FynApp X1 v2',
    useDebug: false,
});
