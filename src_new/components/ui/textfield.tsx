import * as React from "react";
import { useState, useRef } from "react";
import { cn } from "@/lib/utils";
import { Input } from "./input";

interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    decoration?: {
        startDecoration?: React.ReactNode;
        endDecoration?: React.ReactNode;
    };
}

const TextField: React.FC<TextFieldProps> = ({
    label,
    decoration,
    className,
    ...props
}) => {
    const [focused, setFocused] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleFocus = () => setFocused(true);
    const handleBlur = () => setFocused(false);

    return (
        <div
            className={cn(
                "relative flex items-center border rounded-md",
                focused ? "border-primary" : "border-input",
                props.disabled && "opacity-75",
                className
            )}
        >
            {decoration?.startDecoration}
            <div className="relative flex-grow">
                {label && (
                    <label
                        className={cn(
                            "absolute left-3 transition-all duration-300",
                            focused || props.value
                                ? "top-1 text-xs text-muted-foreground"
                                : "top-1/2 -translate-y-1/2 text-base"
                        )}
                        htmlFor={props.id}
                    >
                        {label}
                    </label>
                )}
                <Input
                    ref={inputRef}
                    className="w-full h-full p-3 bg-transparent border-none outline-none"
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    {...props}
                />
            </div>
            {decoration?.endDecoration}
        </div>
    );
};

export { TextField };