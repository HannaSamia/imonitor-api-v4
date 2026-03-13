#!/usr/bin/env python3
import asn1tools
import gzip
import io
import json
import sys
import zipfile
from pathlib import Path


class CDRDecoder:
    def __init__(self):
        schema_dir = Path(__file__).parent.parent / 'assets' / 'cdrDecoder' / 'schemas'
        
        self.schema_configs = {
            'SDPCallDataRecord': [str(schema_dir / 'sdp.asn')],
            'DetailOutputRecord': [str(schema_dir / 'air.asn')],
            'ChargingDataOutputRecord': [
                str(schema_dir / 'ccr_ec22.asn'),
                str(schema_dir / 'occ_ccn.asn')
            ],
            'GPRSRecord': [str(schema_dir / 'ggsn.asn')],
            'CallDataRecord': [str(schema_dir / 'msc.asn')],
        }
        
        self.ggsn_tag = b'\xbf\x4f'
        self.schemas = {}
    
    def _get_schema(self, record_type: str):
        if record_type not in self.schemas:
            self.schemas[record_type] = asn1tools.compile_files(
                self.schema_configs[record_type], codec='ber'
            )
        return self.schemas[record_type]
    
    def _detect_record_type(self, data: bytes) -> tuple:
        if len(data) < 2:
            return None, None
        
        if data[:2] == self.ggsn_tag:
            return 'GPRSRecord', self.ggsn_tag
        
        tag = data[0]
        
        if tag == 0xa2:
            return 'SDPCallDataRecord', bytes([tag])
        elif tag == 0xa0:
            return 'CallDataRecord', bytes([tag])
        elif tag == 0xa6:
            return 'TRY_A6', bytes([tag])
        
        return None, None
    
    def _find_next_record(self, data: bytes, offset: int, start_tag: bytes) -> int:
        pos = data.find(start_tag, offset)
        return pos if pos != -1 else len(data)
    
    def _extract_data(self, file_path: str) -> bytes:
        with open(file_path, 'rb') as f:
            data = f.read()
        
        if data[:2] == b'\x1f\x8b':
            return gzip.decompress(data)
        
        if data[:2] == b'PK':
            with zipfile.ZipFile(io.BytesIO(data)) as zf:
                names = zf.namelist()
                if len(names) == 0:
                    raise ValueError("Empty zip file")
                return zf.read(names[0])
        
        return data
    
    def decode_file(self, file_path: str) -> list:
        records = []
        data = self._extract_data(file_path)
        total_size = len(data)
        
        if total_size == 0:
            raise ValueError("Empty file")
        
        record_type, start_tag = self._detect_record_type(data)
        if not record_type:
            raise ValueError("Unsupported file format - unknown record type")
        
        if record_type == 'TRY_A6':
            try:
                schema = self._get_schema('DetailOutputRecord')
                decoded, consumed = schema.decode_with_length('DetailOutputRecord', data)
                record_type = 'DetailOutputRecord'
            except:
                record_type = 'ChargingDataOutputRecord'
        
        schema = self._get_schema(record_type)
        
        offset = 0
        consecutive_failures = 0
        
        while offset < total_size:
            try:
                decoded, consumed = schema.decode_with_length(record_type, data[offset:])
                records.append(self._convert_bytes(decoded))
                offset += consumed
                consecutive_failures = 0
            except:
                consecutive_failures += 1
                if consecutive_failures > 10:
                    next_pos = self._find_next_record(data, offset + 1, start_tag)
                    if next_pos >= total_size:
                        break
                    offset = next_pos
                    consecutive_failures = 0
                else:
                    offset += 1
        
        if len(records) == 0:
            raise ValueError("Unsupported file format - no records decoded")
        
        return records
    
    def _convert_bytes(self, obj):
        if isinstance(obj, bytes):
            try:
                return obj.decode('utf-8')
            except:
                return obj.hex()
        elif isinstance(obj, dict):
            return {k: self._convert_bytes(v) for k, v in obj.items()}
        elif isinstance(obj, (list, tuple)):
            return [self._convert_bytes(item) for item in obj]
        return obj


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python decoder.py <cdr_file_path>", file=sys.stderr)
        sys.exit(1)
    
    try:
        decoder = CDRDecoder()
        input_path = Path(sys.argv[1])
        records = decoder.decode_file(str(input_path))
        
        output_path = input_path.parent / f"{input_path.stem}_decoded.json"
        with open(output_path, 'w') as f:
            json.dump(records, f, separators=(',', ':'), default=str)
        
        print(f"Decoded {len(records)} records -> {output_path}")
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)