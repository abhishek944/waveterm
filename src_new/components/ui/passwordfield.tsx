import * as React from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff } from "lucide-react";

interface PasswordFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const PasswordField: React.FC<PasswordFieldProps> = ({ className, ...props }) => {
    const [showPassword, setShowPassword] = useState(false);

    return (
        <div className="relative">
            <Input
                type={showPassword ? "text" : "password"}
                className={cn("pr-10", className)}
                {...props}
            />
            <button
                type="button"
                className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-500"
                onClick={() => setShowPassword(!showPassword)}
            >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
        </div>
    );
};

export { PasswordField };