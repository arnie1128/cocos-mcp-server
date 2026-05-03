import { dumpUnwrap } from './dump-unwrap';

export async function getSceneRoots(): Promise<Array<{ uuid: string; name?: string }>> {
    const tree: any = await Editor.Message.request('scene', 'query-node-tree');
    const roots = Array.isArray(tree) ? tree : tree ? [tree] : [];
    return roots
        .map((item: any) => {
            const uuid = dumpUnwrap(item?.uuid);
            if (typeof uuid !== 'string' || uuid.length === 0) return null;
            const name = dumpUnwrap(item?.name);
            return typeof name === 'string' ? { uuid, name } : { uuid };
        })
        .filter((item: { uuid: string; name?: string } | null): item is { uuid: string; name?: string } => item !== null);
}

export async function getSceneRootUuid(): Promise<string | undefined> {
    return (await getSceneRoots())[0]?.uuid;
}
