import { GearApi, GearKeyring } from '@gear-js/api';
import { readFileSync, writeFileSync } from 'fs';
import { PATH_TO_OPT } from '../config';

let id = '';

const uploadCode = async () => {
    const api = await GearApi.create({
        // providerAddress: 'ws://127.0.0.1:9944',
        providerAddress: 'wss://rpc-node.gear-tech.io',
    });

    const user = await GearKeyring.fromSuri('//Alice');
    console.log(`User logined address: ${user.address}`);

    const code = readFileSync(PATH_TO_OPT);

    const { codeHash } = await api.code.upload(code);

    console.log(`CodeHash: ${codeHash}\n`);

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
        process.exit(0)
    })
    .catch((error) => {
        console.log(error);
        process.exit(1);
    });
