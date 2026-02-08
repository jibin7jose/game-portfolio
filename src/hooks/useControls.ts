import { useEffect, useState } from 'react';

export const useControls = () => {
    const [keys, setKeys] = useState({
        forward: false,
        backward: false,
        left: false,
        right: false,
        brake: false,
        reset: false,
    });

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            switch (e.key.toLowerCase()) {
                case 'w':
                case 'arrowup':
                    setKeys((keys) => ({ ...keys, forward: true }));
                    break;
                case 's':
                case 'arrowdown':
                    setKeys((keys) => ({ ...keys, backward: true }));
                    break;
                case 'a':
                case 'arrowleft':
                    setKeys((keys) => ({ ...keys, left: true }));
                    break;
                case 'd':
                case 'arrowright':
                    setKeys((keys) => ({ ...keys, right: true }));
                    break;
                case ' ':
                    setKeys((keys) => ({ ...keys, brake: true }));
                    break;
                case 'r':
                    setKeys((keys) => ({ ...keys, reset: true }));
                    break;
                default:
                    break;
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            switch (e.key.toLowerCase()) {
                case 'w':
                case 'arrowup':
                    setKeys((keys) => ({ ...keys, forward: false }));
                    break;
                case 's':
                case 'arrowdown':
                    setKeys((keys) => ({ ...keys, backward: false }));
                    break;
                case 'a':
                case 'arrowleft':
                    setKeys((keys) => ({ ...keys, left: false }));
                    break;
                case 'd':
                case 'arrowright':
                    setKeys((keys) => ({ ...keys, right: false }));
                    break;
                case ' ':
                    setKeys((keys) => ({ ...keys, brake: false }));
                    break;
                case 'r':
                    setKeys((keys) => ({ ...keys, reset: false }));
                    break;
                default:
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

    return keys;
};
