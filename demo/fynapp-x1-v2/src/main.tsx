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
    const sizeClasses = {
        small: 'py-1.5 px-3 text-sm',
        medium: 'py-2.5 px-5 text-base',
        large: 'py-3.5 px-7 text-lg',
    }[size];

    const variantClasses = {
        primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 shadow-sm',
        secondary: 'bg-gray-600 text-white hover:bg-gray-700 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 shadow-sm',
        outline: 'border-2 border-gray-300 bg-transparent text-gray-700 hover:bg-gray-50 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2',
        danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 shadow-sm',
        success: 'bg-green-600 text-white hover:bg-green-700 focus:ring-2 focus:ring-green-500 focus:ring-offset-2 shadow-sm',
        warning: 'bg-yellow-600 text-white hover:bg-yellow-700 focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 shadow-sm',
    }[variant];

    const baseClasses = 'inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed active:scale-95';

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
            ) : (
                <>
                    {icon && iconPosition === 'left' && <span className="mr-2">{icon}</span>}
                    {children}
                    {icon && iconPosition === 'right' && <span className="ml-2">{icon}</span>}
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
    const variantClasses = {
        default: 'bg-white',
        bordered: 'bg-white border border-gray-200',
        elevated: 'bg-white shadow-lg',
    }[variant];

    return (
        <div className={`rounded-xl overflow-hidden ${variantClasses} ${className}`}>
            {title && (
                <div className="card-header flex items-center justify-between p-4 border-b border-gray-100">
                    <h3 className="text-lg font-semibold text-gray-900">{title} v2</h3>
                    {headerAction && <div>{headerAction}</div>}
                </div>
            )}
            <div className="card-body p-4">{children}</div>
            {footer && (
                <div className="card-footer p-4 border-t border-gray-100 bg-gray-50">
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

    return (
        <div className="mb-4">
            {label && (
                <label htmlFor={inputId} className="mb-2 block text-sm font-medium text-gray-700">
                    {label}
                </label>
            )}
            <div className="relative">
                {icon && iconPosition === 'left' && (
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        {icon}
                    </div>
                )}
                <input
                    ref={ref}
                    id={inputId}
                    className={`w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 transition-colors duration-200
                        ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}
                        ${icon && iconPosition === 'left' ? 'pl-10' : ''}
                        ${icon && iconPosition === 'right' ? 'pr-10' : ''}
                        ${className}`}
                    {...props}
                />
                {icon && iconPosition === 'right' && (
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                        {icon}
                    </div>
                )}
            </div>
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
    size?: 'small' | 'medium' | 'large';
    closeOnOverlayClick?: boolean;
}

export const Modal: FC<ModalProps> = ({
    isOpen,
    onClose,
    title,
    children,
    footer,
    size = 'medium',
    closeOnOverlayClick = true,
}) => {
    useEffect(() => {
        if (isOpen) {
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

    const sizeClasses = {
        small: 'max-w-sm',
        medium: 'max-w-md',
        large: 'max-w-lg',
    }[size];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto">
            <div
                className="fixed inset-0 bg-black bg-opacity-50 transition-opacity backdrop-blur-sm"
                onClick={closeOnOverlayClick ? onClose : undefined}
            ></div>
            <div className={`relative z-50 w-full ${sizeClasses} rounded-xl bg-white shadow-2xl transform transition-all duration-300 ease-in-out sm:mx-auto`}>
                {title && (
                    <div className="card-header flex items-center justify-between p-4 border-b border-gray-100">
                        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-500 focus:outline-none"
                        >
                            <span className="sr-only">Close</span>
                            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                )}
                <div className="card-body p-4">{children}</div>
                {footer && (
                    <div className="card-footer p-4 border-t border-gray-100 bg-gray-50">
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

    const variantClasses = {
        info: 'bg-blue-50 text-blue-800 border-blue-200',
        success: 'bg-green-50 text-green-800 border-green-200',
        warning: 'bg-yellow-50 text-yellow-800 border-yellow-200',
        error: 'bg-red-50 text-red-800 border-red-200',
    }[variant];

    return (
        <div className={`rounded-lg border p-4 ${variantClasses} ${className}`} role="alert">
            <div className="flex items-start">
                {icon && <div className="flex-shrink-0 mr-3">{icon}</div>}
                <div className="flex-grow">{children}</div>
                {dismissible && (
                    <button
                        type="button"
                        className="ml-auto -mx-1.5 -my-1.5 rounded-lg p-1.5 inline-flex text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
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
    const sizeClasses = {
        small: 'px-2 py-0.5 text-xs',
        medium: 'px-2.5 py-0.5 text-sm',
        large: 'px-3 py-1 text-base',
    }[size];

    const variantClasses = {
        default: 'bg-gray-100 text-gray-800',
        primary: 'bg-blue-100 text-blue-800',
        success: 'bg-green-100 text-green-800',
        warning: 'bg-yellow-100 text-yellow-800',
        danger: 'bg-red-100 text-red-800',
    }[variant];

    return (
        <span className={`inline-flex items-center rounded-full font-medium ${sizeClasses} ${variantClasses} ${className}`}>
            {dot && (
                <span className={`w-2 h-2 rounded-full mr-1.5 ${variant === 'default' ? 'bg-gray-500' :
                    variant === 'primary' ? 'bg-blue-500' :
                        variant === 'success' ? 'bg-green-500' :
                            variant === 'warning' ? 'bg-yellow-500' :
                                'bg-red-500'
                    }`}></span>
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

    if (variant === 'dots') {
        return (
            <div className={`flex space-x-1 ${className}`}>
                {[0, 1, 2].map((i) => (
                    <div
                        key={i}
                        className={`${sizeClasses} ${colorClasses} rounded-full animate-bounce`}
                        style={{ animationDelay: `${i * 0.15}s` }}
                    />
                ))}
            </div>
        );
    }

    if (variant === 'pulse') {
        return (
            <div className={`${sizeClasses} ${colorClasses} ${className} animate-pulse rounded-full bg-current`} />
        );
    }

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
