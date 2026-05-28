-- =============================================================================
-- 00010_seed_medicines.sql
-- Pilot medicine catalogue — common Nigerian essential medicines.
-- Idempotent: wrapped in a DO block that skips if medicines already exist.
-- Runs as postgres (superuser) — bypasses RLS.
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.medicines LIMIT 1) THEN
    RAISE NOTICE '00010: medicines table already has rows — skipping seed';
    RETURN;
  END IF;

  INSERT INTO public.medicines
    (generic_name, dosage_form, strength, therapeutic_class,
     essential_medicine, is_active)
  VALUES

  -- Antimalarials
  ('Artemether + Lumefantrine',         'tablet',              '20mg + 120mg',          'Antimalarial',      true,  true),
  ('Artesunate',                        'tablet',              '50mg',                  'Antimalarial',      true,  true),
  ('Artesunate',                        'injection',           '60mg/vial',             'Antimalarial',      true,  true),
  ('Dihydroartemisinin + Piperaquine',  'tablet',              '40mg + 320mg',          'Antimalarial',      true,  true),
  ('Chloroquine phosphate',             'tablet',              '250mg',                 'Antimalarial',      true,  true),
  ('Amodiaquine',                       'tablet',              '200mg',                 'Antimalarial',      true,  true),

  -- Antibiotics
  ('Amoxicillin',                       'capsule',             '500mg',                 'Antibiotic',        true,  true),
  ('Amoxicillin',                       'suspension',          '250mg/5ml',             'Antibiotic',        true,  true),
  ('Amoxicillin + Clavulanate',         'tablet',              '500mg + 125mg',         'Antibiotic',        false, true),
  ('Ampicillin',                        'capsule',             '500mg',                 'Antibiotic',        true,  true),
  ('Metronidazole',                     'tablet',              '400mg',                 'Antibiotic',        true,  true),
  ('Metronidazole',                     'suspension',          '200mg/5ml',             'Antibiotic',        true,  true),
  ('Metronidazole',                     'injection',           '500mg/100ml',           'Antibiotic',        true,  true),
  ('Ciprofloxacin',                     'tablet',              '500mg',                 'Antibiotic',        true,  true),
  ('Azithromycin',                      'tablet',              '500mg',                 'Antibiotic',        false, true),
  ('Azithromycin',                      'tablet',              '250mg',                 'Antibiotic',        false, true),
  ('Cotrimoxazole',                     'tablet',              '480mg',                 'Antibiotic',        true,  true),
  ('Cotrimoxazole',                     'suspension',          '240mg/5ml',             'Antibiotic',        true,  true),
  ('Doxycycline',                       'capsule',             '100mg',                 'Antibiotic',        true,  true),
  ('Cloxacillin',                       'capsule',             '500mg',                 'Antibiotic',        true,  true),
  ('Erythromycin',                      'tablet',              '250mg',                 'Antibiotic',        true,  true),
  ('Cefuroxime',                        'tablet',              '500mg',                 'Antibiotic',        false, true),
  ('Ceftriaxone',                       'injection',           '1g/vial',               'Antibiotic',        true,  true),
  ('Gentamicin',                        'injection',           '80mg/2ml',              'Antibiotic',        true,  true),

  -- Analgesics & Antipyretics
  ('Paracetamol',                       'tablet',              '500mg',                 'Analgesic',         true,  true),
  ('Paracetamol',                       'suspension',          '250mg/5ml',             'Analgesic',         true,  true),
  ('Ibuprofen',                         'tablet',              '400mg',                 'Analgesic',         true,  true),
  ('Ibuprofen',                         'suspension',          '100mg/5ml',             'Analgesic',         true,  true),
  ('Diclofenac',                        'tablet',              '50mg',                  'Analgesic',         true,  true),
  ('Diclofenac',                        'injection',           '75mg/3ml',              'Analgesic',         true,  true),
  ('Aspirin',                           'tablet',              '75mg',                  'Analgesic',         true,  true),
  ('Tramadol',                          'capsule',             '50mg',                  'Analgesic',         false, true),
  ('Morphine',                          'injection',           '10mg/ml',               'Analgesic',         true,  true),

  -- Antihypertensives
  ('Amlodipine',                        'tablet',              '5mg',                   'Antihypertensive',  true,  true),
  ('Amlodipine',                        'tablet',              '10mg',                  'Antihypertensive',  true,  true),
  ('Lisinopril',                        'tablet',              '5mg',                   'Antihypertensive',  true,  true),
  ('Lisinopril',                        'tablet',              '10mg',                  'Antihypertensive',  true,  true),
  ('Losartan',                          'tablet',              '50mg',                  'Antihypertensive',  false, true),
  ('Atenolol',                          'tablet',              '50mg',                  'Antihypertensive',  true,  true),
  ('Hydrochlorothiazide',               'tablet',              '25mg',                  'Antihypertensive',  true,  true),
  ('Nifedipine',                        'tablet',              '20mg (SR)',              'Antihypertensive',  true,  true),
  ('Methyldopa',                        'tablet',              '250mg',                 'Antihypertensive',  true,  true),

  -- Antidiabetics
  ('Metformin',                         'tablet',              '500mg',                 'Antidiabetic',      true,  true),
  ('Metformin',                         'tablet',              '850mg',                 'Antidiabetic',      true,  true),
  ('Glibenclamide',                     'tablet',              '5mg',                   'Antidiabetic',      true,  true),
  ('Glimepiride',                       'tablet',              '2mg',                   'Antidiabetic',      false, true),
  ('Insulin (Regular)',                 'injection',           '100IU/ml',              'Antidiabetic',      true,  true),
  ('Insulin (NPH)',                     'injection',           '100IU/ml',              'Antidiabetic',      true,  true),

  -- Gastrointestinal
  ('Omeprazole',                        'capsule',             '20mg',                  'Gastrointestinal',  true,  true),
  ('Omeprazole',                        'injection',           '40mg/vial',             'Gastrointestinal',  false, true),
  ('Ranitidine',                        'tablet',              '150mg',                 'Gastrointestinal',  true,  true),
  ('Metoclopramide',                    'tablet',              '10mg',                  'Gastrointestinal',  true,  true),
  ('Loperamide',                        'capsule',             '2mg',                   'Gastrointestinal',  true,  true),
  ('Oral Rehydration Salts',            'powder',              '27.9g sachet',          'Gastrointestinal',  true,  true),
  ('Zinc Sulfate',                      'tablet',              '20mg',                  'Gastrointestinal',  true,  true),

  -- Vitamins & Supplements
  ('Folic Acid',                        'tablet',              '5mg',                   'Vitamin/Supplement', true, true),
  ('Ferrous Sulfate',                   'tablet',              '200mg',                 'Vitamin/Supplement', true, true),
  ('Vitamin C (Ascorbic Acid)',         'tablet',              '100mg',                 'Vitamin/Supplement', true, true),
  ('Vitamin B-Complex',                 'tablet',              'standard',              'Vitamin/Supplement', false, true),
  ('Vitamin D3',                        'capsule',             '400IU',                 'Vitamin/Supplement', false, true),
  ('Calcium Carbonate',                 'tablet',              '500mg',                 'Vitamin/Supplement', false, true),

  -- Antifungals
  ('Fluconazole',                       'capsule',             '150mg',                 'Antifungal',        false, true),
  ('Fluconazole',                       'tablet',              '200mg',                 'Antifungal',        false, true),
  ('Nystatin',                          'suspension',          '100000IU/ml',           'Antifungal',        true,  true),
  ('Clotrimazole',                      'cream',               '1%',                    'Antifungal',        true,  true),
  ('Ketoconazole',                      'tablet',              '200mg',                 'Antifungal',        false, true),

  -- Respiratory
  ('Salbutamol',                        'inhaler',             '100mcg/dose',           'Respiratory',       true,  true),
  ('Salbutamol',                        'nebuliser solution',  '2.5mg/2.5ml',           'Respiratory',       true,  true),
  ('Prednisolone',                      'tablet',              '5mg',                   'Respiratory',       true,  true),
  ('Dexamethasone',                     'injection',           '4mg/ml',                'Respiratory',       true,  true),
  ('Theophylline',                      'tablet',              '200mg (SR)',             'Respiratory',       true,  true),

  -- Central Nervous System
  ('Diazepam',                          'tablet',              '5mg',                   'CNS',               true,  true),
  ('Diazepam',                          'injection',           '5mg/ml',                'CNS',               true,  true),
  ('Phenobarbitone',                    'tablet',              '30mg',                  'CNS',               true,  true),
  ('Carbamazepine',                     'tablet',              '200mg',                 'CNS',               true,  true),
  ('Phenytoin',                         'capsule',             '100mg',                 'CNS',               true,  true),
  ('Haloperidol',                       'tablet',              '5mg',                   'CNS',               false, true),

  -- Tuberculosis
  ('Rifampicin + Isoniazid',            'tablet',              '150mg + 75mg',          'Antituberculosis',  true,  true),
  ('Rifampicin + Isoniazid + Pyrazinamide', 'tablet',          '150mg + 75mg + 400mg',  'Antituberculosis',  true,  true),
  ('Pyrazinamide',                      'tablet',              '400mg',                 'Antituberculosis',  true,  true),
  ('Ethambutol',                        'tablet',              '400mg',                 'Antituberculosis',  true,  true),

  -- Antiretrovirals
  ('Tenofovir + Lamivudine + Efavirenz','tablet',              '300mg + 300mg + 600mg', 'Antiretroviral',    true,  true),
  ('Lamivudine',                        'tablet',              '150mg',                 'Antiretroviral',    true,  true),
  ('Nevirapine',                        'tablet',              '200mg',                 'Antiretroviral',    true,  true),
  ('Lopinavir + Ritonavir',             'tablet',              '200mg + 50mg',          'Antiretroviral',    false, true),

  -- Antiparasitic
  ('Ivermectin',                        'tablet',              '6mg',                   'Antiparasitic',     true,  true),
  ('Albendazole',                       'tablet',              '400mg',                 'Antiparasitic',     true,  true),
  ('Mebendazole',                       'tablet',              '100mg',                 'Antiparasitic',     true,  true),
  ('Praziquantel',                      'tablet',              '600mg',                 'Antiparasitic',     true,  true),

  -- Contraceptives & Obstetrics
  ('Levonorgestrel + Ethinylestradiol', 'tablet',              '150mcg + 30mcg',        'Contraceptive',     true,  true),
  ('Levonorgestrel (emergency)',         'tablet',              '1.5mg',                 'Contraceptive',     true,  true),
  ('Oxytocin',                          'injection',           '10IU/ml',               'Obstetrics',        true,  true),
  ('Misoprostol',                       'tablet',              '200mcg',                'Obstetrics',        true,  true),
  ('Magnesium Sulfate',                 'injection',           '500mg/ml',              'Obstetrics',        true,  true);

  RAISE NOTICE '00010: seeded % medicines', (SELECT COUNT(*) FROM public.medicines);
END $$;
