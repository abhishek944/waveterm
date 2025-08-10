import * as React from "react";
import { Button, ButtonProps } from "./button";
import { cn } from "@/lib/utils";

interface LinkButtonProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
}

const LinkButton: React.FC<LinkButtonProps> = ({
    leftIcon,
    rightIcon,
    children,
    className,
    ...rest
}) => {
    return (
        <a {...rest} className={cn("text-primary underline-offset-4 hover:underline", className)}>
            {leftIcon && <span className="mr-2">{leftIcon}</span>}
            {children}
            {rightIcon && <span className="ml-2">{rightIcon}</span>}
        </a>
    );
};

export { LinkButton };