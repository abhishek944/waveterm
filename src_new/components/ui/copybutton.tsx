import * as React from "react";
import { useState } from "react";
import { Button } from "./button";
import { cn } from "@/lib/utils";
import { Check, Copy } from "lucide-react";

interface CopyButtonProps {
    title: string;
    className?: string;
    onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

const CopyButton: React.FC<CopyButtonProps> = ({ title, className, onClick }) => {
    const [isCopied, setIsCopied] = useState(false);

    const handleOnClick = (e: React.MouseEvent<HTMLButtonElement>) => {
        if (isCopied) {
            return;
        }
        setIsCopied(true);
        setTimeout(() => {
            setIsCopied(false);
        }, 2000);
        onClick?.(e);
    };

    return (
        <Button
            onClick={handleOnClick}
            className={cn("p-1 h-auto", className)}
            title={title}
            variant="ghost"
        >
            {isCopied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
        </Button>
    );
};

export { CopyButton };