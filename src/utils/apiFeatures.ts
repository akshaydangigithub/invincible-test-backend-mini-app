class APIfeatures {
  query: any;
  queryString: Record<string, any>;
  forCount?: boolean;

  constructor(query: any, queryString: Record<string, any>, forCount?: boolean) {
    this.query = query;
    this.queryString = queryString;
    this.forCount = forCount;
  }

  filter(): this {
    const queryObj = { ...this.queryString };
    const excludedFields = ["page", "limit", "sort", "fields", "search", "token"];
    excludedFields.forEach((field) => delete queryObj[field]);

    // Advanced filtering
    let queryStr = JSON.stringify(queryObj);
    queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, (match) => `$${match}`);
    const queryStrJson = JSON.parse(queryStr);

    this.query = this.query.find(queryStrJson);
    return this;
  }

  sort(): this {
    if (this.queryString.sort) {
      const sortBy = this.queryString.sort.split(",").join(" ");
      this.query = this.query.sort(sortBy);
    } else {
      this.query = this.query.sort("-createdAt");
    }
    return this;
  }

  limitFields(): this {
    if (this.queryString.fields) {
      const fields = this.queryString.fields.split(",").join(" ");
      this.query = this.query.select(fields);
    } else {
      this.query = this.query.select("-__v");
    }
    return this;
  }

  pagination(): this {
    const page = parseInt(this.queryString.page, 10) || 1;
    const limit = parseInt(this.queryString.limit, 10) || 100;
    const skip = (page - 1) * limit;

    this.query = this.query.skip(skip).limit(limit);

    console.log("Page No:", page);
    console.log("Limit:", limit);

    return this;
  }

  search(): this {
    if (this.queryString.search) {
      const searchValue = new RegExp(this.queryString.search.trim(), "i");
      const searchFields = Object.keys(this.query.model.schema.paths).filter(
        (field) => this.query.model.schema.paths[field].instance === "String"
      );
      const searchCriteria = searchFields.map((field) => ({
        [field]: searchValue,
      }));

      this.query = this.query.find({ $or: searchCriteria });
    }
    return this;
  }
}

export default APIfeatures;  