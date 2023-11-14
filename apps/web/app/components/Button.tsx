import { ReactNode } from "react";

interface ButtonProps {
    onClick?: (...args: any[]) => void;
    children: ReactNode;
    className?: string;
}

export default function Button({ children, onClick, className = "" }: ButtonProps) {
    return (
        <button className={`bg-primary hover:bg-[#333333] w-28 h-8 font-medium text-sm text-white text-center rounded transition duration-300 ${className}` }
        onClick={onClick}
        >
            {children}
        </button>
    );
}
