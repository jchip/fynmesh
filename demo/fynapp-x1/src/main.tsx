import React from 'react';
import './styles.css';

// @ts-ignore
import { useState, useEffect } from 'react';

// Types/interfaces for components
type ReactNode = React.ReactNode;
type ButtonHTMLAttributes<T> = React.ButtonHTMLAttributes<T>;
type InputHTMLAttributes<T> = React.InputHTMLAttributes<T>;
type FC<P = {}> = React.FC<P>;
const forwardRef = React.forwardRef;

export function main() {
    //
}

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

    return (
        <button
            ref={ref}
            className={`${baseClasses} ${sizeClasses} ${variantClasses} ${className}`}
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
                    <h3 className="text-lg font-medium text-gray-900">{title} v1</h3>
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
        <div className="mb-4">
            {label && (
                <label htmlFor={inputId} className="mb-2 block text-sm font-medium text-gray-700">
                    {label}
                </label>
            )}
            <input
                ref={ref}
                id={inputId}
                className={`input ${error ? 'input-error' : ''} ${className}`}
                {...props}
            />
            {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
            {helperText && !error && <p className="mt-1 text-sm text-gray-500">{helperText}</p>}
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
            // Add padding to prevent layout shift when scrollbar disappears
            const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
            document.body.style.paddingRight = `${scrollbarWidth}px`;
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.paddingRight = '';
            document.body.style.overflow = '';
        }

        return () => {
            document.body.style.paddingRight = '';
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto">
            <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" onClick={onClose}></div>
            <div className="relative z-50 w-full max-w-md rounded-lg bg-white shadow-xl sm:mx-auto">
                {title && (
                    <div className="card-header">
                        <h3 className="text-lg font-medium text-gray-900">{title}</h3>
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
            <div className="flex">
                <div className="flex-grow">{children}</div>
                {dismissible && (
                    <button
                        type="button"
                        className="ml-auto inline-flex text-gray-400 hover:text-gray-500 focus:outline-none"
                        onClick={handleDismiss}
                        aria-label="Dismiss"
                    >
                        <span className="sr-only">Dismiss</span>
                        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
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
    const variantClasses = {
        default: 'bg-gray-100 text-gray-800',
        primary: 'bg-blue-100 text-blue-800',
        success: 'bg-green-100 text-green-800',
        warning: 'bg-yellow-100 text-yellow-800',
        danger: 'bg-red-100 text-red-800',
    }[variant];

    return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variantClasses} ${className}`}>
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
    const sizeClasses = {
        small: 'w-4 h-4',
        medium: 'w-6 h-6',
        large: 'w-8 h-8',
    }[size];

    const colorClasses = {
        primary: 'text-blue-600',
        gray: 'text-gray-500',
        white: 'text-white',
    }[color];

    return (
        <svg
            className={`animate-spin ${sizeClasses} ${colorClasses} ${className}`}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
        >
            <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
            />
            <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
        </svg>
    );
};
