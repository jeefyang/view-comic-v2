import imageSize from 'image-size';

export async function decodeSize(url: string): Promise<[{ width: number, height: number; } | undefined, any]> {
    const rangeSize = 65536;
    return new Promise(async (res, _rej) => {
        try {
            const response = await fetch(url, {
                headers: {
                    'Range': `bytes=0-${rangeSize}`
                }
            });
            if (!response.ok) {
                return res([undefined, response.statusText]);
            }

            // 2. 获取二进制数据
            const arrayBuffer = await response.arrayBuffer();
            // 我们不需要做任何特殊处理，直接传给解析库即可
            const actualSize = arrayBuffer.byteLength;

            // 4. 转换为 Buffer
            const buffer = new Uint8Array(arrayBuffer);

            const data = imageSize(buffer);
            return res([data, undefined]);
        }
        catch (error) {
            return res([undefined, error]);
        }
    });
}