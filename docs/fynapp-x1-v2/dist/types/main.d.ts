import React from 'react';
import { FynModuleRuntime } from "@fynmesh/kernel";
import './styles.css';
type ReactNode = React.ReactNode;
type InputHTMLAttributes<T> = React.InputHTMLAttributes<T>;
type FC<P = {}> = React.FC<P>;
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'success' | 'warning';
    size?: 'small' | 'medium' | 'large';
    isLoading?: boolean;
    icon?: ReactNode;
    iconPosition?: 'left' | 'right';
    children?: ReactNode;
}
export declare const Button: React.ForwardRefExoticComponent<ButtonProps & React.RefAttributes<HTMLButtonElement>>;
interface CardProps {
    children: ReactNode;
    title?: string;
    footer?: ReactNode;
    className?: string;
    variant?: 'default' | 'bordered' | 'elevated';
    headerAction?: ReactNode;
}
export declare const Card: FC<CardProps>;
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
    helperText?: string;
    icon?: ReactNode;
    iconPosition?: 'left' | 'right';
}
export declare const Input: React.ForwardRefExoticComponent<InputProps & React.RefAttributes<HTMLInputElement>>;
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
export declare const Modal: FC<ModalProps>;
interface AlertProps {
    children: ReactNode;
    variant?: 'info' | 'success' | 'warning' | 'error';
    dismissible?: boolean;
    onDismiss?: () => void;
    className?: string;
    icon?: ReactNode;
}
export declare const Alert: FC<AlertProps>;
interface BadgeProps {
    children: ReactNode;
    variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
    className?: string;
    size?: 'small' | 'medium' | 'large';
    dot?: boolean;
}
export declare const Badge: FC<BadgeProps>;
interface SpinnerProps {
    size?: 'small' | 'medium' | 'large';
    color?: 'primary' | 'gray' | 'white';
    className?: string;
    variant?: 'default' | 'dots' | 'pulse';
}
export declare const Spinner: FC<SpinnerProps>;
export declare const main: {
    execute(runtime: FynModuleRuntime): Promise<void>;
};
export {};
