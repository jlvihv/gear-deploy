import { GearApi, GearKeyring, getWasmMetadata } from '@gear-js/api';
import { readFileSync, writeFileSync } from 'fs';
import { PATH_TO_OPT, PATH_TO_META } from '../config';

let id = '';
let metaString = '';

const uploadCode = async () => {
    const api = await GearApi.create({
        // providerAddress: 'ws://127.0.0.1:9944',
        providerAddress: 'wss://rpc-node.gear-tech.io',
    });

    const user = await GearKeyring.fromSuri('//Alice');
    console.log(`User logined address: ${user.address}`);

    const code = readFileSync(PATH_TO_OPT);
    const metaFile = readFileSync(PATH_TO_META);

    const { codeHash } = await api.code.upload(code);

    console.log(`CodeHash: ${codeHash}\n`);

    const meta = await getWasmMetadata(metaFile);
    let metaInfo = JSON.stringify(meta, undefined, 2);
    console.log(`Meta: ${metaInfo}`);
    metaString = meta.types.toString();
    console.log(`MetaString: ${metaString}`);

    try {
        return await new Promise((resolve, reject) => {
            api.code.signAndSend(user, ({ events, status }) => {
                console.log(`STATUS: ${status.toString()}`);
                if (status.isFinalized) resolve(status.asFinalized);
                events.forEach(({ event }) => {
                    if (event.method === 'ExtrinsicFailed') {
                        reject(api.getExtrinsicFailedError(event).docs.join('/n'));
                    } else if (event.method === 'CodeChanged' && status.isInBlock) {
                        let json = JSON.stringify(event.toHuman(), undefined, 2)
                        console.log(json);
                        let result = JSON.parse(json);
                        id = result.data.id;
                    }
                });
            });
        });
    } catch (error) {
        console.log(error);
    }
};

uploadCode()
    .then(() => {
        console.log(`ProgramID: ${id}\n`);
        writeFileSync('programID.txt', `REACT_APP_PROGRAM_ID=${id}`);
        writeFileSync('metaString.txt', `REACT_APP_META_TYPES=${metaString}`);
        process.exit(0)
    })
    .catch((error) => {
        console.log(error);
        process.exit(1);
    });
