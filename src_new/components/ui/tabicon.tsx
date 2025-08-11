import * as React from "react";
import { cn } from "@/lib/utils";

interface TabIconProps {
    icon: string;
    color: string;
}

const TabIcon: React.FC<TabIconProps> = ({ icon, color }) => {
    let iconClass = "";
    if (icon === "default" || icon === "square") {
        iconClass = "fa-solid fa-square fa-fw";
    } else if (icon === "cloud") {
        iconClass = "fa-solid fa-cloud fa-fw";
    } else {
        iconClass = `fa-sharp fa-solid fa-${icon} fa-fw`;
    }
    if (!color || color === "default") {
        color = "green";
    }

    // Map colors to Tailwind text color classes
    const colorClasses = {
        green: "text-green-500",
        orange: "text-orange-500",
        red: "text-red-500",
        yellow: "text-yellow-500",
        blue: "text-blue-500",
        mint: "text-teal-500",
        cyan: "text-cyan-500",
        white: "text-white",
        violet: "text-violet-500",
        pink: "text-pink-500",
    };

    const textColorClass = colorClasses[color] || colorClasses.green;

    return (
        <i className={cn(iconClass, textColorClass)} />
    );
};

export { TabIcon };
