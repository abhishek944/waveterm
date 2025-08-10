import * as React from "react";
import { cn } from "@/lib/utils";

const TypingIndicator: React.FC<{ className?: string }> = ({ className }) => {
    return (
        <div className={cn("flex items-center space-x-1", className)}>
            <span className="h-2 w-2 bg-gray-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
            <span className="h-2 w-2 bg-gray-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
            <span className="h-2 w-2 bg-gray-500 rounded-full animate-bounce" />
        </div>
    );
};

export { TypingIndicator };