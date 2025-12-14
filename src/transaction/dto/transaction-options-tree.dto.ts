export type CountryOption = { code: string; name: string };

export type MethodOption = {
  id: number;
  name: string;
  countries: CountryOption[];
};

export type ProviderOption = {
  id: number;
  name: string;
  methods: MethodOption[];
};

export type MerchantOption = {
  id: string;
  name: string;
  providers: ProviderOption[];
};

export type OptionsTreeResponse = {
  merchants: MerchantOption[];
};

export type OptionsRow = {
  merchant_id: string;
  merchant_name: string;
  provider_id: number | string;
  provider_name: string;
  method_id: number | string;
  method_name: string;
  country_code: string;
  country_name: string;
};

export type MethodBucket = {
  id: number;
  name: string;
  countries: Map<string, CountryOption>;
};

export type ProviderBucket = {
  id: number;
  name: string;
  methods: Map<number, MethodBucket>;
};

export type MerchantBucket = {
  id: string;
  name: string;
  providers: Map<number, ProviderBucket>;
};
