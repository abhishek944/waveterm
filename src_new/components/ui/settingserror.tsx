import * as React from "react";
import { X } from "lucide-react";

interface SettingsErrorProps {
    errorMessage: string | null;
    onDismiss: () => void;
}

const SettingsError: React.FC<SettingsErrorProps> = ({ errorMessage, onDismiss }) => {
    if (!errorMessage) {
        return null;
    }

    return (
        <div className="flex items-center justify-between p-2 bg-red-100 text-red-700 rounded-md">
            <span>Error: {errorMessage}</span>
            <button onClick={onDismiss} className="p-1 rounded-md hover:bg-red-200">
                <X className="h-4 w-4" />
            </button>
        </div>
    );
};

export { SettingsError };