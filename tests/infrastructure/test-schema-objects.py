#!/usr/bin/env python3
import importlib.util
import json
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location("inventory",ROOT/"tests/infrastructure/verify-schema-objects.py")
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
DATA=json.loads((ROOT/"docs/infrastructure/SCHEMA_OBJECT_FINGERPRINTS_2026-11-10.json").read_text())

class ObjectInventoryTests(unittest.TestCase):
    def test_inventory(self): self.assertTrue(mod.validate(DATA))
    def test_missing_policy_fails(self):
        copy=json.loads(json.dumps(DATA));copy["policies"].pop()
        with self.assertRaises(AssertionError): mod.validate(copy)
    def test_duplicate_index_fails(self):
        copy=json.loads(json.dumps(DATA));copy["indexes"].append(copy["indexes"][0])
        with self.assertRaises(AssertionError): mod.validate(copy)
    def test_altered_fingerprint_fails(self):
        copy=json.loads(json.dumps(DATA));copy["triggers"][0]["fingerprint"]="invalid"
        with self.assertRaises(AssertionError): mod.validate(copy)
    def test_missing_security_marker_fails(self):
        copy=json.loads(json.dumps(DATA));copy["functions"][0]["security_definer"]=None
        with self.assertRaises(AssertionError): mod.validate(copy)
if __name__=="__main__": unittest.main()
