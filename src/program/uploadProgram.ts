import { GearApi, GearKeyring, getWasmMetadata } from '@gear-js/api';
import { decodeAddress } from '@gear-js/api';
import { readFileSync, writeFileSync } from 'fs';
import { PATH_TO_META, PATH_TO_OPT } from '../config';
import { waitForInit } from './waitForInit';

let id = '';
let metaString = '';

const main = async () => {
    const api = await GearApi.create({
        // providerAddress: 'ws://127.0.0.1:9944',
        providerAddress: 'wss://rpc-node.gear-tech.io',
    });

    const user = await GearKeyring.fromSuri('//Alice');
    // const user = await GearKeyring.fromMnemonic('or some mnemonic');
    console.log(`User logined address: ${user.address}`);

    const code = readFileSync(PATH_TO_OPT);
    const metaFile = readFileSync(PATH_TO_META);

    const meta = await getWasmMetadata(metaFile);
    let metaInfo = JSON.stringify(meta, undefined, 2);
    console.log(`Meta: ${metaInfo}`);
    metaString = meta.types.toString();
    console.log(`MetaString: ${metaString}`);

    const initPayload = {
        name_of_event: 'GEAR JS EXAMPLE',
    };

    const gas = await api.program.calculateGas.initUpload(decodeAddress(user.address), code, initPayload, 0, true, meta);

    const { programId } = api.program.upload({ code, initPayload, gasLimit: gas.min_limit }, meta);

    console.log(`ProgramID: ${programId}\n`);
    id = programId;

    waitForInit(api, programId)
        .then(() => console.log('Program initialization was successful'))
        .catch((error) => {
            console.log(`Program initialization failed due to next error: ${error}\n`);
        });

    try {
        return await new Promise((resolve, reject) => {
            api.program.signAndSend(user, ({ events, status }) => {
                console.log(`STATUS: ${status.toString()}`);
                if (status.isFinalized) resolve(status.asFinalized);
                events.forEach(({ event }) => {
                    if (event.method === 'ExtrinsicFailed') {
                        reject(api.getExtrinsicFailedError(event).docs.join('/n'));
                    }
                });
            });
        });
    } catch (error) {
        console.log(error);
    }
};

main()
    .then(() => {
        writeFileSync('programID.txt', `REACT_APP_PROGRAM_ID=${id}`);
        writeFileSync('metaString.txt', `REACT_APP_META_TYPES=${metaString}`);
        process.exit(0)
    })
    .catch((error) => {
        console.log(error);
        process.exit(1);
    });
