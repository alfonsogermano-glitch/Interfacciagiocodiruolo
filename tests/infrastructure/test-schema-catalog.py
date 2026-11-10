#!/usr/bin/env python3
import json
import unittest
import importlib.util
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location("catalog",ROOT/"tests/infrastructure/verify-schema-catalog.py")
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
data=json.loads((ROOT/"docs/infrastructure/SCHEMA_CATALOG_METADATA_2026-11-10.json").read_text())
class CatalogTests(unittest.TestCase):
    def test_snapshot(self): self.assertTrue(mod.validate(data))
    def test_missing_rls(self):
        copy=json.loads(json.dumps(data));copy["tables"][0]["rls"]=False
        with self.assertRaises(AssertionError): mod.validate(copy)
    def test_missing_column(self):
        copy=json.loads(json.dumps(data));copy["tables"][0]["columns"]=[]
        with self.assertRaises(AssertionError): mod.validate(copy)
    def test_duplicate_table(self):
        copy=json.loads(json.dumps(data));copy["tables"][1]["table"]=copy["tables"][0]["table"]
        with self.assertRaises(AssertionError): mod.validate(copy)
if __name__=="__main__": unittest.main()
