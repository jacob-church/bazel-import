import { ExecException } from 'child_process';

type Rejection = {
    error: ExecException;
    stderr: string;
};

export function isRejection(error: unknown): error is Rejection {
    return (
        typeof error === 'object' &&
        error !== null &&
        'error' in error &&
        'stderr' in error &&
        typeof (error as Rejection).stderr === 'string'
    );
}

type SpawnError = {
    code: string;
    errno: number;
};

export function isSpawnError(error: unknown): error is SpawnError {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        'errno' in error &&
        typeof (error as SpawnError).code === 'string' &&
        typeof (error as SpawnError).errno === 'number'
    );
}

