import { NodeSerialPortProvider } from "@kontave/devices-node";

const ports = await new NodeSerialPortProvider().list();
process.stdout.write(`${JSON.stringify(ports, null, 2)}\n`);
