import * as React from "react";

interface SettingItemProps {
    title: string;
    description: string;
    children: React.ReactNode;
}

const SettingItem: React.FC<SettingItemProps> = ({ title, description, children }) => {
    return (
        <div className="flex flex-row items-center mt-[10px]">
            <div className="w-[250px] mr-[10px]">
                <div className="font-bold">{title}</div>
                <div className="text-sm text-gray-500">{description}</div>
            </div>
            <div className="flex flex-row items-center">{children}</div>
        </div>
    );
};

export { SettingItem };