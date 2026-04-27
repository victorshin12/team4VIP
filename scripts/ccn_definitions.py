"""
CCN Classification and Visualization Module
Provides data structures for categorizing CMS Certification Numbers (formerly 
OSCAR Provider Numbers, Medicare Identification Numbers, or Medicare/Medicaid Provider Numbers).
"""

ccn_metadata = {
    "current_name": "CMS Certification Number (CCN)",
    "former_names": [
        "Medicare/Medicaid Provider Number",
        "OSCAR Provider Number",
        "Medicare Identification Number"
    ],
    "format_part_a": "6 digits (2-digit state code + 4-digit facility code)",
    "format_special": "6 alphanumeric (2-digit state code + 1 alpha character + 3-digit sequence/parent link)",
    "format_part_b": "10-digit alphanumeric"
}

# Standard Part A Numeric Ranges (Last 4 digits)
ccn_facility_types = [
    (1, 879, "Short-term (General and Specialty) Hospitals"),
    (880, 899, "Reserved for hospitals participating in ORD demonstration project"),
    (900, 999, "Multiple Hospital Component in a Medical Complex (Numbers Retired)"),
    (1000, 1199, "Federally Qualified Health Centers"),
    (1200, 1224, "Alcohol/Drug Hospitals (Numbers Retired)"),
    (1225, 1299, "Medical Assistance Facilities"),
    (1300, 1399, "Critical Access Hospitals"),
    (1400, 1499, "Continuation of Community Mental Health Centers (4900-4999 series)"),
    (1500, 1799, "Hospices"),
    (1800, 1989, "Federally Qualified Health Centers"),
    (1990, 1999, "Religious Non-medical Health Care Institutions (formerly Christian Science Sanatoria (Hospital Services)"),
    (2000, 2299, "Long-Term Hospitals (Excluded from PPS)"),
    (2300, 2499, "Hospital Based Renal Dialysis Facilities"),
    (2500, 2899, "Independent Renal Dialysis Facilities"),
    (2900, 2999, "Independent Special Purpose Renal Dialysis Facility"),
    (3000, 3024, "Formerly Tuberculosis Hospitals (Numbers Retired)"),
    (3025, 3099, "Rehabilitation Hospitals (Excluded from PPS)"),
    (3100, 3199, "Home Health Agencies"),
    (3200, 3299, "Continuation of Comprehensive Outpatient Rehabilitation Facilities (4800-4899) Series"),
    (3300, 3399, "Children's Hospitals (Excluded from PPS)"),
    (3400, 3499, "Continuation of Rural Health Clinics (Provider-based) (3975-3999) Series"),
    (3500, 3699, "Hospital Based Satellite Renal Dialysis Facilities"),
    (3700, 3799, "Hospital Based Special Purpose Renal Dialysis Facility"),
    (3800, 3974, "Rural Health Clinics (Free-Standing)"),
    (3975, 3999, "Rural Health Clinics (Provider-Based)"),
    (4000, 4499, "Psychiatric Hospitals (Excluded from PPS)"),
    (4500, 4599, "Comprehensive Outpatient Rehabilitation Facilities"),
    (4600, 4799, "Community Mental Health Centers"),
    (4800, 4899, "Continuation of Comprehensive Outpatient Rehabilitation Facilities (4500-4599 Series)"),
    (4900, 4999, "Continuation of Community Mental Health Centers (4600-4799) Series"),
    (5000, 6499, "Skilled Nursing Facilities"),
    (6500, 6989, "Outpatient Physical Therapy Services"),
    (6990, 6999, "Numbers Reserved (formerly Christian Science Sanatoria (Skilled Nursing Services)"),
    (7000, 8499, "Continuation of Home Health Agencies (3100-3199) Series"),
    (8500, 8899, "Continuation of Rural Health Clinics (Provider-Based) (3400-3499) Series"),
    (8900, 8999, "Continuation of Rural Health Clinics (Free-Standing) (3800-3974) Series"),
    (9000, 9799, "Continuation of Home Health Agencies (8000-8499) Series"),
    (9800, 9899, "Transplant Centers"),
    (9900, 9999, "Reserved for Future Use")
]

# Special Alphanumeric Designations (Third Position)
ccn_special_types = {
    "M": "Psychiatric Unit in Critical Access Hospital",
    "R": "Rehabilitation Unit in Critical Access Hospital",
    "S": "Psychiatric Unit",
    "T": "Rehabilitation Unit",
    "U": "Swing-Bed Hospital Designation for Short-Term Hospitals",
    "W": "Swing-Bed Hospital Designation for Long Term Care Hospitals",
    "Y": "Swing-Bed Hospital Designation for Rehabilitation Hospitals",
    "Z": "Swing-Bed Designation for Critical Access Hospitals",
    "A": "NF (Formerly assigned to Medicaid SNF)",
    "B": "NF (Formerly assigned to Medicaid SNF) Expansion",
    "E": "NF (Formerly assigned to ICF)",
    "F": "NF (Formerly assigned to ICF) Expansion",
    "G": "ICF/MR",
    "H": "ICF/MR Expansion",
    "K": "Medicaid HHAs",
    "L": "Psychiatric Residential Treatment Facilities (PRTF)"
}

category_mapping = {
    "Hospitals & Inpatient Care": [
        "Short-term (General and Specialty) Hospitals",
        "Reserved for hospitals participating in ORD demonstration project",
        "Multiple Hospital Component in a Medical Complex (Numbers Retired)",
        "Alcohol/Drug Hospitals (Numbers Retired)",
        "Medical Assistance Facilities",
        "Critical Access Hospitals",
        "Long-Term Hospitals (Excluded from PPS)",
        "Formerly Tuberculosis Hospitals (Numbers Retired)",
        "Rehabilitation Hospitals (Excluded from PPS)",
        "Children's Hospitals (Excluded from PPS)",
        "Psychiatric Hospitals (Excluded from PPS)",
        # Special Units added here
        "Psychiatric Unit in Critical Access Hospital",
        "Rehabilitation Unit in Critical Access Hospital",
        "Psychiatric Unit",
        "Rehabilitation Unit"
    ],
    "Renal & Dialysis Facilities": [
        "Hospital Based Renal Dialysis Facilities",
        "Independent Renal Dialysis Facilities",
        "Independent Special Purpose Renal Dialysis Facility",
        "Hospital Based Satellite Renal Dialysis Facilities",
        "Hospital Based Special Purpose Renal Dialysis Facility"
    ],
    "Outpatient Clinics & Centers": [
        "Federally Qualified Health Centers",
        "Continuation of Community Mental Health Centers (4900-4999 series)",
        "Continuation of Comprehensive Outpatient Rehabilitation Facilities (4800-4899) Series",
        "Continuation of Rural Health Clinics (Provider-based) (3975-3999) Series",
        "Rural Health Clinics (Free-Standing)",
        "Rural Health Clinics (Provider-Based)",
        "Comprehensive Outpatient Rehabilitation Facilities",
        "Community Mental Health Centers",
        "Continuation of Community Mental Health Centers (4600-4799) Series",
        "Outpatient Physical Therapy Services",
        "Continuation of Rural Health Clinics (Provider-Based) (3400-3499) Series",
        "Continuation of Rural Health Clinics (Free-Standing) (3800-3974) Series"
    ],
    "Post-Acute & Home Care": [
        "Hospices",
        "Home Health Agencies",
        "Skilled Nursing Facilities",
        "Continuation of Home Health Agencies (3100-3199) Series",
        "Continuation of Home Health Agencies (8000-8499) Series",
        # Special Swing-Bed & Medicaid Types added here
        "Swing-Bed Hospital Designation for Short-Term Hospitals",
        "Swing-Bed Hospital Designation for Long Term Care Hospitals",
        "Swing-Bed Hospital Designation for Rehabilitation Hospitals",
        "Swing-Bed Designation for Critical Access Hospitals",
        "NF (Formerly assigned to Medicaid SNF)",
        "NF (Formerly assigned to Medicaid SNF) Expansion",
        "NF (Formerly assigned to ICF)",
        "NF (Formerly assigned to ICF) Expansion",
        "ICF/MR",
        "ICF/MR Expansion",
        "Medicaid HHAs",
        "Psychiatric Residential Treatment Facilities (PRTF)"
    ],
    "Specialty, Reserved & Other": [
        "Religious Non-medical Health Care Institutions (formerly Christian Science Sanatoria (Hospital Services)",
        "Numbers Reserved (formerly Christian Science Sanatoria (Skilled Nursing Services)",
        "Transplant Centers",
        "Reserved for Future Use"
    ]
}

# Invert the mapping for O(1) lookups
description_to_category = {}
for broad_category, descriptions in category_mapping.items():
    for desc in descriptions:
        description_to_category[desc] = broad_category

grouped_ccn_data = {
    "metadata": ccn_metadata,
    "categories": {category: [] for category in category_mapping.keys()}
}

# 1. Process Standard Numeric Part A Ranges
for start, end, description in ccn_facility_types:
    parent_category = description_to_category.get(description, "Specialty, Reserved & Other")
    
    grouped_ccn_data["categories"][parent_category].append({
        "type": "numeric_range",
        "start": start,
        "end": end,
        "subtype": description,
        "range_size": (end - start) + 1
    })

# 2. Process Special Alphanumeric Codes
for alpha_code, description in ccn_special_types.items():
    parent_category = description_to_category.get(description, "Specialty, Reserved & Other")
    
    grouped_ccn_data["categories"][parent_category].append({
        "type": "alpha_character",
        "code": alpha_code,
        "subtype": description,
        "position": 3 # Alpha character is located in the 3rd position of the string
    })

def classify_ccn(ccn_string):
    """
    Evaluates both 6-digit standard CCNs and alphanumeric special designations.
    """
    ccn_string = str(ccn_string).strip().upper()
    
    if len(ccn_string) != 6:
        return "Invalid CCN Length"
        
    # Check for Special Alpha Character in the 3rd position
    third_char = ccn_string[2]
    if third_char.isalpha():
        subtype = ccn_special_types.get(third_char, "Unknown Special Designation")
        parent_category = description_to_category.get(subtype, "Unknown")
        return f"{parent_category}: {subtype}"
        
    # Standard Numeric Evaluation
    try:
        facility_code = int(ccn_string[-4:])
        for start, end, description in ccn_facility_types:
            if start <= facility_code <= end:
                parent_category = description_to_category.get(description, "Unknown")
                return f"{parent_category}: {description}"
        return "Unknown Numeric Type"
    except ValueError:
        return "Invalid Format"