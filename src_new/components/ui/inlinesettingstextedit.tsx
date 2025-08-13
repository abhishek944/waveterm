import * as React from "react";
import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Input } from "@/components/ui/input";
import { Check, X, Pencil } from "lucide-react";

interface InlineSettingsTextEditProps {
    text: string;
    value: string;
    onChange: (val: string) => void;
    maxLength: number;
    placeholder: string;
    showIcon?: boolean;
    isNumber?: boolean;
}

const InlineSettingsTextEdit: React.FC<InlineSettingsTextEditProps> = ({
    text,
    value,
    onChange,
    maxLength,
    placeholder,
    showIcon = false,
    isNumber = false,
}) => {
    const [isEditing, setIsEditing] = useState(false);
    const [tempText, setTempText] = useState(value);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isEditing]);

    const handleChangeText = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (isNumber && val !== "" && !/^\d*$/.test(val)) {
            return;
        }
        setTempText(val);
    };

    const confirmChange = () => {
        setIsEditing(false);
        onChange(tempText);
    };

    const cancelChange = () => {
        setIsEditing(false);
        setTempText(value);
    };

    const clickEdit = () => {
        setIsEditing(true);
    };

    if (isEditing) {
        return (
            <div className="flex items-center space-x-2">
                <Input
                    ref={inputRef}
                    type="text"
                    placeholder={placeholder}
                    onChange={handleChangeText}
                    value={tempText}
                    maxLength={maxLength}
                    onBlur={cancelChange}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") confirmChange();
                        if (e.key === "Escape") cancelChange();
                    }}
                />
                <Button 
                    variant="ghost" 
                    size="icon" 
                    onMouseDown={(e) => e.preventDefault()} 
                    onClick={cancelChange} 
                    title="Cancel (Esc)"
                >
                    <X className="h-4 w-4" />
                </Button>
                <Button 
                    variant="ghost" 
                    size="icon" 
                    onMouseDown={(e) => e.preventDefault()} 
                    onClick={confirmChange} 
                    title="Confirm (Enter)"
                >
                    <Check className="h-4 w-4" />
                </Button>
            </div>
        );
    }

    return (
        <div onClick={clickEdit} className="flex items-center cursor-pointer group">
            <span>{text}</span>
            {showIcon && <Pencil className="h-4 w-4 ml-2 opacity-0 group-hover:opacity-100 transition-opacity" />}
        </div>
    );
};

export { InlineSettingsTextEdit };