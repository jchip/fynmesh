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
} from '../../shared-demo-utils/x1-components/types.ts';

import { getBadgeVariantStyles } from '../../shared-demo-utils/x1-components/styles.ts';

// @ts-ignore
type ReactNode = React.ReactNode;

// ---- v1 Button ----

interface ButtonProps extends BaseButtonProps {
    variant?: 'primary' | 'secondary' | 'outline' | 'danger';
}

function getV1ButtonVariantStyles(variant: string): React.CSSProperties {
    switch (variant) {
        case 'secondary':
            return {
                backgroundColor: 'var(--fynmesh-color-secondary)',
                color: 'var(--fynmesh-color-light)',
            };
        case 'outline':
            return {
                backgroundColor: 'rgba(0, 0, 0, 0.08)',
                color: 'var(--fynmesh-color-dark)',
                borderWidth: '2px',
                borderStyle: 'solid',
                borderColor: 'var(--fynmesh-color-dark)',
                boxShadow: 'var(--fynmesh-shadow-sm)',
            };
        case 'danger':
            return {
                backgroundColor: 'var(--fynmesh-color-danger)',
                color: 'var(--fynmesh-color-light)',
            };
        default: // primary
            return {
                backgroundColor: 'var(--fynmesh-color-primary)',
                color: 'var(--fynmesh-color-light)',
            };
    }
}

export const Button = createButton<ButtonProps>({
    getVariantStyles: getV1ButtonVariantStyles,
    borderRadius: 'var(--fynmesh-radius-md)',
    className: '',
    renderLoading: () => (
        <>
            <span className="spinner spinner-small mr-2"></span>
            <span>Loading...</span>
        </>
    ),
    renderContent: (children: ReactNode) => <>{children}</>,
});

// ---- v1 Card ----

interface CardProps extends BaseCardProps {
    variant?: never;
    headerAction?: never;
}

export const Card = createCard<CardProps>({
    getVariantStyles: () => ({}),
    titleFontWeight: 'var(--fynmesh-font-weight-medium)',
    className: 'card',
});

// ---- v1 Input ----

interface InputProps extends BaseInputProps {
    icon?: never;
    iconPosition?: never;
}

export const Input = createInput<InputProps>({
    getInputClassName: (error?: string) => {
        return `input ${error ? 'input-error' : ''}`.trim();
    },
    supportsIcon: false,
});

// ---- v1 Modal ----

interface ModalProps extends BaseModalProps {
    size?: never;
    closeOnOverlayClick?: never;
    overlayOpacity?: never;
    overlayBlur?: never;
}

export const Modal = createModal<ModalProps>({
    getMaxWidth: () => '28rem',
    overlayClassName: '',
    contentClassName: '',
    titleFontWeight: 'var(--fynmesh-font-weight-medium)',
    renderCloseIcon: () => (
        <span style={{ fontSize: '1.25rem', lineHeight: 1 }}>&times;</span>
    ),
    contentPanelStyle: {
        borderRadius: 'var(--fynmesh-radius-lg)',
        background: 'var(--fynmesh-color-light)',
        boxShadow: 'var(--fynmesh-shadow-xl)',
    },
});

// ---- v1 Alert ----

interface AlertProps extends BaseAlertProps {
    icon?: never;
}

export const Alert = createAlert<AlertProps>({
    getClassName: (variant: string, className: string) =>
        `alert alert-${variant} ${className}`.trim(),
    dismissButtonStyle: {
        marginLeft: 'auto',
        display: 'inline-flex',
        color: 'var(--fynmesh-color-secondary)',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        outline: 'none',
    },
    supportsIcon: false,
});

// ---- v1 Badge ----

interface BadgeProps extends BaseBadgeProps {
    size?: never;
    dot?: never;
}

export const Badge = createBadge<BadgeProps>({
    getClassName: (_variant: string, _size: string, className: string) => className,
    usesInlineStyles: true,
    getInlineStyles: (variant: string) => ({
        display: 'inline-flex',
        alignItems: 'center',
        padding: 'var(--fynmesh-spacing-xs) var(--fynmesh-spacing-sm)',
        borderRadius: 'var(--fynmesh-radius-full)',
        fontSize: 'var(--fynmesh-text-xs)',
        fontWeight: 'var(--fynmesh-font-weight-medium)',
        fontFamily: 'var(--fynmesh-font-family-sans)',
        ...getBadgeVariantStyles(variant),
    }),
    supportsDot: false,
});

// ---- v1 Spinner ----

interface SpinnerProps extends BaseSpinnerProps {
    variant?: never;
}

export const Spinner = createSpinner<SpinnerProps>({
    getClassName: (_variant: string, className: string) =>
        `spinner ${className}`.trim(),
    supportsVariants: false,
});

// ---- Middleware ----

export const main = createFynAppMiddleware({
    displayName: 'FynApp X1 v1',
    useDebug: true,
});
