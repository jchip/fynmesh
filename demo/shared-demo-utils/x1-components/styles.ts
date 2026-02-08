import React from 'react';

// ---- Shared size styles ----

export function getButtonSizeStyles(size: string): React.CSSProperties {
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
}

// ---- Shared badge variant styles ----

export function getBadgeVariantStyles(variant: string): React.CSSProperties {
    switch (variant) {
        case 'primary':
            return {
                background: 'rgba(37, 99, 235, 0.1)',
                color: 'var(--fynmesh-color-primary)',
            };
        case 'success':
            return {
                background: 'rgba(5, 150, 105, 0.1)',
                color: 'var(--fynmesh-color-success)',
            };
        case 'warning':
            return {
                background: 'rgba(217, 119, 6, 0.1)',
                color: 'var(--fynmesh-color-warning)',
            };
        case 'danger':
            return {
                background: 'rgba(220, 38, 38, 0.1)',
                color: 'var(--fynmesh-color-danger)',
            };
        default:
            return {
                background: 'rgba(100, 116, 139, 0.1)',
                color: 'var(--fynmesh-color-secondary)',
            };
    }
}

// ---- Shared spinner styles ----

export function getSpinnerSizeStyles(size: string): React.CSSProperties {
    switch (size) {
        case 'small':
            return { width: 'var(--fynmesh-spacing-lg)', height: 'var(--fynmesh-spacing-lg)' };
        case 'large':
            return { width: 'var(--fynmesh-spacing-2xl)', height: 'var(--fynmesh-spacing-2xl)' };
        default:
            return { width: 'var(--fynmesh-spacing-xl)', height: 'var(--fynmesh-spacing-xl)' };
    }
}

export function getSpinnerColorStyles(color: string): React.CSSProperties {
    switch (color) {
        case 'gray':
            return { color: 'var(--fynmesh-color-secondary)' };
        case 'white':
            return { color: 'var(--fynmesh-color-light)' };
        default:
            return { color: 'var(--fynmesh-color-primary)' };
    }
}

// ---- Shared label styles ----

export const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: 'var(--fynmesh-spacing-sm)',
    fontSize: 'var(--fynmesh-text-sm)',
    fontWeight: 'var(--fynmesh-font-weight-medium)',
    color: 'var(--fynmesh-color-dark)',
    fontFamily: 'var(--fynmesh-font-family-sans)',
};

export const errorTextStyle: React.CSSProperties = {
    marginTop: 'var(--fynmesh-spacing-xs)',
    fontSize: 'var(--fynmesh-text-sm)',
    color: 'var(--fynmesh-color-danger)',
    fontFamily: 'var(--fynmesh-font-family-sans)',
};

export const helperTextStyle: React.CSSProperties = {
    marginTop: 'var(--fynmesh-spacing-xs)',
    fontSize: 'var(--fynmesh-text-sm)',
    color: 'var(--fynmesh-color-secondary)',
    fontFamily: 'var(--fynmesh-font-family-sans)',
};

// ---- Shared modal styles ----

export const modalOverlayBaseStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--fynmesh-spacing-lg)',
};

export const modalBackdropBaseStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    transition: 'all 0.2s ease',
};

export function getModalContentBaseStyle(maxWidth: string): React.CSSProperties {
    return {
        position: 'relative',
        zIndex: 10000,
        width: '100%',
        maxWidth,
        margin: '0 auto',
        maxHeight: '90vh',
        overflow: 'auto',
    };
}

export const modalTitleBaseStyle = (fontWeight: string): React.CSSProperties => ({
    fontSize: 'var(--fynmesh-text-lg)',
    fontWeight,
    color: 'var(--fynmesh-color-dark)',
    margin: 0,
    fontFamily: 'var(--fynmesh-font-family-sans)',
});

export const modalCloseButtonStyle: React.CSSProperties = {
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
    transition: 'all 0.2s ease',
};

// ---- Shared card title style ----

export const cardTitleStyle = (fontWeight: string): React.CSSProperties => ({
    fontSize: 'var(--fynmesh-text-lg)',
    fontWeight,
    color: 'var(--fynmesh-color-dark)',
    margin: 0,
    fontFamily: 'var(--fynmesh-font-family-sans)',
});

// ---- Shared outline button hover handlers ----

export function outlineMouseEnter(disabled: boolean, isLoading: boolean) {
    return (e: React.MouseEvent<HTMLButtonElement>) => {
        if (!disabled && !isLoading) {
            e.currentTarget.style.backgroundColor = 'var(--fynmesh-color-dark)';
            e.currentTarget.style.color = 'var(--fynmesh-color-light)';
            e.currentTarget.style.borderColor = 'var(--fynmesh-color-dark)';
        }
    };
}

export function outlineMouseLeave(disabled: boolean, isLoading: boolean) {
    return (e: React.MouseEvent<HTMLButtonElement>) => {
        if (!disabled && !isLoading) {
            e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.08)';
            e.currentTarget.style.color = 'var(--fynmesh-color-dark)';
            e.currentTarget.style.borderColor = 'var(--fynmesh-color-dark)';
        }
    };
}

// ---- Modal close button hover handlers ----

export function closeButtonMouseEnter(e: React.MouseEvent<HTMLButtonElement>) {
    e.currentTarget.style.color = 'var(--fynmesh-color-dark)';
    e.currentTarget.style.backgroundColor = 'var(--fynmesh-color-secondary)';
}

export function closeButtonMouseLeave(e: React.MouseEvent<HTMLButtonElement>) {
    e.currentTarget.style.color = 'var(--fynmesh-color-secondary)';
    e.currentTarget.style.backgroundColor = 'transparent';
}

// ---- Dismiss close icon SVG path ----

export const dismissSvgPath = "M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z";
