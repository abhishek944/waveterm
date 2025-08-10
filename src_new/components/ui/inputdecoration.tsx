import * as React from "react";
import { cn } from "@/lib/utils";

interface InputDecorationProps {
    position?: "start" | "end";
    children: React.ReactNode;
}

const InputDecoration: React.FC<InputDecorationProps> = ({ children, position = "end" }) => {
    return (
        <div
            className={cn(
                "flex items-center justify-center",
                position === "start" ? "mr-2" : "ml-2"
            )}
        >
            {children}
        </div>
    );
};

export { InputDecoration };