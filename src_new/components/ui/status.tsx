import * as React from "react";
import { cn } from "@/lib/utils";

interface StatusProps {
    status: "green" | "red" | "gray" | "yellow";
    text: string;
}

const Status: React.FC<StatusProps> = ({ status, text }) => {
    const dotColor = {
        green: "bg-green-500",
        red: "bg-red-500",
        gray: "bg-gray-500",
        yellow: "bg-yellow-500",
    };

    return (
        <div className="flex items-center">
            <div className={cn("h-2 w-2 rounded-full mr-2", dotColor[status])} />
            <span>{text}</span>
        </div>
    );
};

export { Status };